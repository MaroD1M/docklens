package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Listen      string
	DockerHost  string
	DataDir     string
	WebDir      string
	Refresh     time.Duration
	ScanTimeout time.Duration
	Dev         bool
	HostID      string
	HostScan    bool
}

func Load() Config {
	cfg := Config{
		Listen:      env("DOCKLENS_LISTEN", "127.0.0.1:7577"),
		DockerHost:  env("DOCKER_HOST", "unix:///var/run/docker.sock"),
		DataDir:     env("DOCKLENS_DATA_DIR", "./data"),
		WebDir:      env("DOCKLENS_WEB_DIR", ""),
		Refresh:     time.Duration(envInt("DOCKLENS_REFRESH", 30)) * time.Second,
		ScanTimeout: time.Duration(envInt("DOCKLENS_SCAN_TIMEOUT", 15)) * time.Second,
		Dev:         envBool("DOCKLENS_DEV", false),
		HostID:      env("DOCKLENS_HOST_ID", "local"),
		HostScan:    envBool("DOCKLENS_HOST_SCAN", false),
	}
	if cfg.Refresh < 5*time.Second {
		cfg.Refresh = 5 * time.Second
	}
	return cfg
}

func env(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func envInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func envBool(key string, fallback bool) bool {
	value := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if value == "" {
		return fallback
	}
	return value == "1" || value == "true" || value == "yes" || value == "on"
}
