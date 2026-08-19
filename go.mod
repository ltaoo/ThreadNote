module example/simple

go 1.24

require (
	github.com/Danny-Dasilva/CycleTLS/cycletls v1.0.23
	github.com/aws/aws-sdk-go-v2 v1.16.16
	github.com/aws/aws-sdk-go-v2/service/s3 v1.27.11
	github.com/ltaoo/clipboard-go v0.2.0
	github.com/ltaoo/velo v1.1.1
	github.com/rs/zerolog v1.34.0
	golang.org/x/crypto v0.20.0
	golang.org/x/image v0.28.0
	golang.org/x/net v0.21.0
	golang.org/x/text v0.26.0
)

require (
	filippo.io/edwards25519 v1.1.0 // indirect
	github.com/Danny-Dasilva/fhttp v0.0.0-20231127034941-9494939f30fa // indirect
	github.com/andybalholm/brotli v1.0.6 // indirect
	github.com/aws/aws-sdk-go-v2/aws/protocol/eventstream v1.4.8 // indirect
	github.com/aws/aws-sdk-go-v2/internal/configsources v1.1.23 // indirect
	github.com/aws/aws-sdk-go-v2/internal/endpoints/v2 v2.4.17 // indirect
	github.com/aws/aws-sdk-go-v2/internal/v4a v1.0.14 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/accept-encoding v1.9.9 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/checksum v1.1.18 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/presigned-url v1.9.17 // indirect
	github.com/aws/aws-sdk-go-v2/service/internal/s3shared v1.13.17 // indirect
	github.com/aws/smithy-go v1.13.3 // indirect
	github.com/blang/semver/v4 v4.0.0 // indirect
	github.com/cloudflare/circl v1.3.6 // indirect
	github.com/dustin/go-humanize v1.0.1 // indirect
	github.com/ebitengine/purego v0.10.0 // indirect
	github.com/gaukas/godicttls v0.0.4 // indirect
	github.com/glebarez/go-sqlite v1.21.2 // indirect
	github.com/glebarez/sqlite v1.11.0 // indirect
	github.com/go-sql-driver/mysql v1.8.1 // indirect
	github.com/golang-migrate/migrate/v4 v4.17.1 // indirect
	github.com/google/uuid v1.4.0 // indirect
	github.com/gorilla/websocket v1.5.1 // indirect
	github.com/hashicorp/errwrap v1.1.0 // indirect
	github.com/hashicorp/go-multierror v1.1.1 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/pgx/v5 v5.6.0 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/jinzhu/inflection v1.0.0 // indirect
	github.com/jinzhu/now v1.1.5 // indirect
	github.com/klauspost/compress v1.17.3 // indirect
	github.com/lib/pq v1.10.9 // indirect
	github.com/mattn/go-colorable v0.1.13 // indirect
	github.com/mattn/go-isatty v0.0.19 // indirect
	github.com/mattn/go-sqlite3 v1.14.22 // indirect
	github.com/nfnt/resize v0.0.0-20180221191011-83c6a9932646 // indirect
	github.com/quic-go/quic-go v0.40.0 // indirect
	github.com/refraction-networking/utls v1.5.4 // indirect
	github.com/remyoudompheng/bigfft v0.0.0-20230129092748-24d4a6f8daec // indirect
	github.com/ulikunitz/xz v0.5.15 // indirect
	go.uber.org/atomic v1.7.0 // indirect
	golang.design/x/hotkey v0.4.1 // indirect
	golang.org/x/sync v0.15.0 // indirect
	golang.org/x/sys v0.17.0 // indirect
	gorm.io/driver/mysql v1.5.7 // indirect
	gorm.io/driver/postgres v1.5.11 // indirect
	gorm.io/driver/sqlite v1.5.7 // indirect
	gorm.io/gorm v1.25.12 // indirect
	modernc.org/libc v1.22.5 // indirect
	modernc.org/mathutil v1.5.0 // indirect
	modernc.org/memory v1.5.0 // indirect
	modernc.org/sqlite v1.23.1 // indirect
)

// Pin x/net and x/text to versions compatible with Go 1.20 (like wx_channels_download)
replace (
	golang.org/x/net => golang.org/x/net v0.17.0
	golang.org/x/text => golang.org/x/text v0.14.0
)
