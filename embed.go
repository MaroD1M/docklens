package docklens

import "embed"

// WebFS contains the built frontend. Build it with `npm run build` in web/ first.
//
//go:embed all:web/dist
var WebFS embed.FS
