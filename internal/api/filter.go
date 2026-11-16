package api

import (
	"strconv"
	"strings"

	"github.com/MaroD1M/docklens/internal/model"
)

func filterEndpoints(items []model.Endpoint, filter model.EndpointFilter) []model.Endpoint {
	out := make([]model.Endpoint, 0, len(items))
	for _, endpoint := range items {
		if filter.Scope != "" && !strings.EqualFold(string(endpoint.Scope), filter.Scope) {
			continue
		}
		if filter.Source != "" && !strings.EqualFold(string(endpoint.Source), filter.Source) {
			continue
		}
		if filter.Protocol != "" && !strings.EqualFold(string(endpoint.Protocol), filter.Protocol) {
			continue
		}
		if filter.State != "" && !strings.EqualFold(string(endpoint.Status), filter.State) {
			continue
		}
		if filter.Network != "" && !strings.EqualFold(endpoint.Network, filter.Network) && !strings.EqualFold(endpoint.NetworkID, filter.Network) {
			continue
		}
		if filter.Tag != "" && !hasTag(endpoint.Tags, filter.Tag) {
			continue
		}
		if filter.Favorite && !endpoint.Favorite {
			continue
		}
		if filter.Hidden != nil && endpoint.Hidden != *filter.Hidden {
			continue
		}
		if filter.Query != "" && !matchesQuery(endpoint, filter.Query) {
			continue
		}
		out = append(out, endpoint)
	}
	return out
}

func matchesQuery(endpoint model.Endpoint, query string) bool {
	for _, token := range strings.Fields(strings.ToLower(query)) {
		switch {
		case strings.HasPrefix(token, ":"):
			if !matchPort(endpoint.Port, strings.TrimPrefix(token, ":")) {
				return false
			}
		case strings.HasPrefix(token, "ip:"):
			value := strings.TrimPrefix(token, "ip:")
			if !strings.Contains(endpoint.IP, value) && !accessContains(endpoint.AccessIPs, value) {
				return false
			}
		case strings.HasPrefix(token, "net:"):
			value := strings.TrimPrefix(token, "net:")
			if !strings.Contains(strings.ToLower(endpoint.Network), value) && !strings.Contains(strings.ToLower(endpoint.NetworkID), value) {
				return false
			}
		case strings.HasPrefix(token, "tag:"):
			if !hasTag(endpoint.Tags, strings.TrimPrefix(token, "tag:")) {
				return false
			}
		case strings.HasPrefix(token, "proto:"):
			if string(endpoint.Protocol) != strings.TrimPrefix(token, "proto:") {
				return false
			}
		case strings.HasPrefix(token, "scope:"):
			if !strings.EqualFold(string(endpoint.Scope), strings.TrimPrefix(token, "scope:")) {
				return false
			}
		case strings.HasPrefix(token, "source:"):
			if !strings.EqualFold(string(endpoint.Source), strings.TrimPrefix(token, "source:")) {
				return false
			}
		case strings.HasPrefix(token, "state:"):
			if !strings.EqualFold(string(endpoint.Status), strings.TrimPrefix(token, "state:")) {
				return false
			}
		case strings.HasPrefix(token, "hidden:"):
			value := strings.TrimPrefix(token, "hidden:") == "true"
			if endpoint.Hidden != value {
				return false
			}
		case strings.HasPrefix(token, "fav:"):
			value := strings.TrimPrefix(token, "fav:") == "true"
			if endpoint.Favorite != value {
				return false
			}
		default:
			haystack := strings.ToLower(strings.Join([]string{
				endpoint.Service,
				endpoint.Container,
				endpoint.Image,
				endpoint.Stack,
				endpoint.Network,
				endpoint.Note,
				strings.Join(endpoint.Tags, " "),
				endpoint.IP,
				strconv.Itoa(endpoint.Port),
			}, " "))
			if !strings.Contains(haystack, token) {
				return false
			}
		}
	}
	return true
}

func matchPort(port int, value string) bool {
	if strings.Contains(value, "-") {
		parts := strings.SplitN(value, "-", 2)
		start, errStart := strconv.Atoi(parts[0])
		end, errEnd := strconv.Atoi(parts[1])
		if errStart != nil || errEnd != nil {
			return false
		}
		return port >= start && port <= end
	}
	parsed, err := strconv.Atoi(value)
	return err == nil && port == parsed
}

func accessContains(values []model.AccessIP, query string) bool {
	for _, value := range values {
		if strings.Contains(value.IP, query) {
			return true
		}
	}
	return false
}

func hasTag(values []string, tag string) bool {
	for _, value := range values {
		if strings.EqualFold(value, tag) {
			return true
		}
	}
	return false
}
