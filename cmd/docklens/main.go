package main

import (
	"context"
	"errors"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
	_ "time/tzdata"

	docklens "github.com/MaroD1M/docklens"
	"github.com/MaroD1M/docklens/internal/api"
	"github.com/MaroD1M/docklens/internal/collect"
	"github.com/MaroD1M/docklens/internal/config"
	"github.com/MaroD1M/docklens/internal/docker"
	"github.com/MaroD1M/docklens/internal/hostinfo"
	"github.com/MaroD1M/docklens/internal/state"
	"github.com/MaroD1M/docklens/internal/store"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg := config.Load()
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck(cfg))
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	metadata, err := store.Load(cfg.DataDir)
	if err != nil {
		slog.Error("load metadata", "error", err)
		os.Exit(1)
	}

	host := hostinfo.Discover()
	client, err := docker.New(cfg.DockerHost)
	if err != nil {
		slog.Error("docker client", "error", err)
		os.Exit(1)
	}

	collector := collect.New(client, host)
	collector.EnableHostScan(cfg.HostScan)
	appState := state.New(metadata)

	webFS, err := resolveWebFS(cfg)
	if err != nil {
		slog.Error("web assets", "error", err)
		os.Exit(1)
	}

	server := api.New(cfg, appState, collector, webFS)
	triggerCh := make(chan struct{}, 1)
	trigger := func() {
		select {
		case triggerCh <- struct{}{}:
		default:
		}
	}
	server.SetTrigger(trigger)

	initialCtx, cancel := context.WithTimeout(ctx, cfg.ScanTimeout)
	appState.SetScanning(true)
	snapshot, scanErr := collector.Scan(initialCtx)
	cancel()
	if scanErr != nil {
		appState.SetScanError(scanErr)
		slog.Warn("initial docker scan failed", "error", scanErr)
	} else {
		appState.SetScanError(nil)
		appState.Update(snapshot)
		slog.Info("initial scan complete", "containers", len(snapshot.Containers), "endpoints", len(snapshot.Endpoints))
	}
	appState.SetScanning(false)

	go scanLoop(ctx, cfg, collector, appState, triggerCh)
	go eventLoop(ctx, client, trigger)

	httpServer := &http.Server{
		Addr:              cfg.Listen,
		Handler:           server.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       90 * time.Second,
	}
	go func() {
		slog.Info("docklens listening", "address", "http://"+cfg.Listen, "docker", cfg.DockerHost)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("http server", "error", err)
			stop()
		}
	}()

	<-ctx.Done()
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer shutdownCancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		slog.Warn("shutdown", "error", err)
	}
}

func scanLoop(ctx context.Context, cfg config.Config, collector *collect.Collector, appState *state.State, trigger <-chan struct{}) {
	ticker := time.NewTicker(cfg.Refresh)
	defer ticker.Stop()
	debounce := time.NewTimer(time.Hour)
	if !debounce.Stop() {
		<-debounce.C
	}
	pending := false

	for {
		select {
		case <-ctx.Done():
			return
		case <-trigger:
			if !pending {
				pending = true
				debounce.Reset(2 * time.Second)
			}
		case <-debounce.C:
			pending = false
			performScan(ctx, cfg, collector, appState)
		case <-ticker.C:
			performScan(ctx, cfg, collector, appState)
		}
	}
}

func performScan(ctx context.Context, cfg config.Config, collector *collect.Collector, appState *state.State) {
	scanCtx, cancel := context.WithTimeout(ctx, cfg.ScanTimeout)
	defer cancel()
	appState.SetScanning(true)
	snapshot, err := collector.Scan(scanCtx)
	appState.SetScanning(false)
	if err != nil {
		appState.SetScanError(err)
		slog.Warn("docker scan failed", "error", err)
		return
	}
	appState.SetScanError(nil)
	appState.Update(snapshot)
	slog.Info("scan complete", "containers", len(snapshot.Containers), "endpoints", len(snapshot.Endpoints))
}

func eventLoop(ctx context.Context, client *docker.Client, trigger func()) {
	events := make(chan docker.EventMessage, 32)
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case event, ok := <-events:
				if !ok {
					return
				}
				if event.Type == "container" || event.Type == "network" {
					trigger()
				}
			}
		}
	}()

	for {
		if ctx.Err() != nil {
			return
		}
		err := client.StreamEvents(ctx, events)
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			slog.Warn("docker event stream", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(5 * time.Second):
		}
	}
}

func healthcheck(cfg config.Config) int {
	address := strings.TrimSpace(os.Getenv("DOCKLENS_HEALTH_URL"))
	if address == "" {
		hostPort := cfg.Listen
		if strings.HasPrefix(hostPort, "0.0.0.0:") {
			hostPort = "127.0.0.1:" + strings.TrimPrefix(hostPort, "0.0.0.0:")
		} else if strings.HasPrefix(hostPort, "[::]:") {
			hostPort = "127.0.0.1:" + strings.TrimPrefix(hostPort, "[::]:")
		} else if strings.HasPrefix(hostPort, ":") {
			hostPort = "127.0.0.1" + hostPort
		}
		address = "http://" + hostPort + "/healthz"
	}
	client := &http.Client{Timeout: 3 * time.Second}
	response, err := client.Get(address)
	if err != nil {
		return 1
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}

func resolveWebFS(cfg config.Config) (http.FileSystem, error) {
	if cfg.WebDir != "" {
		return http.Dir(cfg.WebDir), nil
	}
	sub, err := fs.Sub(docklens.WebFS, "web/dist")
	if err != nil {
		return nil, err
	}
	return http.FS(sub), nil
}
