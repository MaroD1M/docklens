package docker

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Client struct {
	http    *http.Client
	baseURL string
	socket  string
}

func New(host string) (*Client, error) {
	host = strings.TrimSpace(host)
	if host == "" {
		host = "unix:///var/run/docker.sock"
	}

	switch {
	case strings.HasPrefix(host, "unix://"):
		socket := strings.TrimPrefix(host, "unix://")
		dialer := &net.Dialer{Timeout: 5 * time.Second}
		transport := &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				return dialer.DialContext(ctx, "unix", socket)
			},
			MaxIdleConns:          16,
			IdleConnTimeout:       30 * time.Second,
			ResponseHeaderTimeout: 20 * time.Second,
		}
		return &Client{http: &http.Client{Transport: transport}, baseURL: "http://docker", socket: socket}, nil

	case strings.HasPrefix(host, "tcp://"):
		base := "http://" + strings.TrimPrefix(host, "tcp://")
		return &Client{http: &http.Client{Transport: &http.Transport{MaxIdleConns: 16}}, baseURL: base}, nil

	case strings.HasPrefix(host, "http://"), strings.HasPrefix(host, "https://"):
		return &Client{http: &http.Client{Transport: &http.Transport{MaxIdleConns: 16}}, baseURL: strings.TrimRight(host, "/")}, nil

	default:
		dialer := &net.Dialer{Timeout: 5 * time.Second}
		transport := &http.Transport{
			DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				return dialer.DialContext(ctx, "unix", host)
			},
		}
		return &Client{http: &http.Client{Transport: transport}, baseURL: "http://docker", socket: host}, nil
	}
}

func (c *Client) Socket() string {
	return c.socket
}

func (c *Client) Version(ctx context.Context) (Version, error) {
	var out Version
	err := c.get(ctx, "/version", nil, &out)
	return out, err
}

func (c *Client) Containers(ctx context.Context) ([]ContainerSummary, error) {
	var out []ContainerSummary
	query := url.Values{}
	query.Set("all", "1")
	err := c.get(ctx, "/containers/json", query, &out)
	return out, err
}

func (c *Client) Inspect(ctx context.Context, id string) (ContainerInspect, error) {
	var out ContainerInspect
	err := c.get(ctx, "/containers/"+url.PathEscape(id)+"/json", nil, &out)
	return out, err
}

func (c *Client) Networks(ctx context.Context) ([]Network, error) {
	var out []Network
	err := c.get(ctx, "/networks", nil, &out)
	return out, err
}

func (c *Client) StreamEvents(ctx context.Context, out chan<- EventMessage) error {
	query := url.Values{}
	query.Set("since", "0")
	req, err := c.request(ctx, http.MethodGet, "/events", query, nil)
	if err != nil {
		return err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("docker events: %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}

	decoder := json.NewDecoder(resp.Body)
	for {
		var event EventMessage
		if err := decoder.Decode(&event); err != nil {
			if ctx.Err() != nil {
				return nil
			}
			if err == io.EOF {
				return nil
			}
			return err
		}
		select {
		case out <- event:
		case <-ctx.Done():
			return nil
		}
	}
}

func (c *Client) get(ctx context.Context, path string, query url.Values, out any) error {
	req, err := c.request(ctx, http.MethodGet, path, query, nil)
	if err != nil {
		return err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("docker %s: %s: %s", path, resp.Status, strings.TrimSpace(string(body)))
	}
	if out == nil {
		_, _ = io.Copy(io.Discard, resp.Body)
		return nil
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("docker %s decode: %w", path, err)
	}
	return nil
}

func (c *Client) request(ctx context.Context, method, path string, query url.Values, body io.Reader) (*http.Request, error) {
	endpoint := c.baseURL + path
	if len(query) > 0 {
		endpoint += "?" + query.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "docklens/0.1")
	return req, nil
}
