param(
    [int]$Port = 8000
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Address = [System.Net.IPAddress]::Parse('127.0.0.1')
$Listener = New-Object System.Net.Sockets.TcpListener($Address, $Port)

function Get-ContentType {
    param([string]$Path)

    switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        '.html' { return 'text/html; charset=utf-8' }
        '.htm'  { return 'text/html; charset=utf-8' }
        '.css'  { return 'text/css; charset=utf-8' }
        '.js'   { return 'application/javascript; charset=utf-8' }
        '.json' { return 'application/json; charset=utf-8' }
        '.svg'  { return 'image/svg+xml' }
        '.png'  { return 'image/png' }
        '.jpg'  { return 'image/jpeg' }
        '.jpeg' { return 'image/jpeg' }
        '.gif'  { return 'image/gif' }
        '.webp' { return 'image/webp' }
        '.ico'  { return 'image/x-icon' }
        '.wav'  { return 'audio/wav' }
        '.mp3'  { return 'audio/mpeg' }
        '.ogg'  { return 'audio/ogg' }
        '.mp4'  { return 'video/mp4' }
        default { return 'application/octet-stream' }
    }
}

function Send-Response {
    param(
        [System.Net.Sockets.NetworkStream]$Stream,
        [int]$StatusCode,
        [string]$Reason,
        [string]$ContentType,
        [byte[]]$Body,
        [bool]$HeadOnly = $false
    )

    if ($null -eq $Body) {
        $Body = [byte[]]@()
    }

    $Header = "HTTP/1.1 $StatusCode $Reason`r`n" +
              "Content-Type: $ContentType`r`n" +
              "Content-Length: $($Body.Length)`r`n" +
              "Cache-Control: no-cache`r`n" +
              "Connection: close`r`n`r`n"

    $HeaderBytes = [System.Text.Encoding]::ASCII.GetBytes($Header)
    $Stream.Write($HeaderBytes, 0, $HeaderBytes.Length)

    if (-not $HeadOnly -and $Body.Length -gt 0) {
        $Stream.Write($Body, 0, $Body.Length)
    }

    $Stream.Flush()
}

try {
    $Listener.Start()
} catch {
    Write-Host ''
    Write-Host "Unable to start Classroom Jeopardy on port $Port." -ForegroundColor Red
    Write-Host 'Another program may already be using that port.' -ForegroundColor Yellow
    Write-Host 'Close any earlier Classroom Jeopardy server window, then try again.'
    Write-Host ''
    Read-Host 'Press Enter to close'
    exit 1
}

$Url = "http://127.0.0.1:$Port/"
Write-Host 'Classroom Jeopardy Version 2 is running.' -ForegroundColor Green
Write-Host "Opening $Url"
Write-Host ''
Write-Host 'Keep this window open while the game is in use.' -ForegroundColor Yellow
Write-Host 'Close this window when the lesson is finished.'
Write-Host ''

Start-Process $Url

try {
    while ($true) {
        $Client = $Listener.AcceptTcpClient()

        try {
            $Stream = $Client.GetStream()
            $Reader = New-Object System.IO.StreamReader(
                $Stream,
                [System.Text.Encoding]::ASCII,
                $false,
                1024,
                $true
            )

            $RequestLine = $Reader.ReadLine()
            if ([string]::IsNullOrWhiteSpace($RequestLine)) {
                continue
            }

            do {
                $HeaderLine = $Reader.ReadLine()
            } while ($null -ne $HeaderLine -and $HeaderLine -ne '')

            $Parts = $RequestLine.Split(' ')
            if ($Parts.Length -lt 2) {
                $Body = [System.Text.Encoding]::UTF8.GetBytes('Bad request')
                Send-Response $Stream 400 'Bad Request' 'text/plain; charset=utf-8' $Body
                continue
            }

            $Method = $Parts[0].ToUpperInvariant()
            $HeadOnly = $Method -eq 'HEAD'
            if ($Method -ne 'GET' -and -not $HeadOnly) {
                $Body = [System.Text.Encoding]::UTF8.GetBytes('Method not allowed')
                Send-Response $Stream 405 'Method Not Allowed' 'text/plain; charset=utf-8' $Body
                continue
            }

            $RawPath = ($Parts[1] -split '\?', 2)[0]
            $DecodedPath = [System.Uri]::UnescapeDataString($RawPath)
            $RelativePath = $DecodedPath.TrimStart('/')

            if ([string]::IsNullOrWhiteSpace($RelativePath)) {
                $RelativePath = 'index.html'
            }

            $RelativePath = $RelativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
            $RootFullPath = [System.IO.Path]::GetFullPath($Root + [System.IO.Path]::DirectorySeparatorChar)
            $RequestedFullPath = [System.IO.Path]::GetFullPath((Join-Path $Root $RelativePath))

            if (-not $RequestedFullPath.StartsWith($RootFullPath, [System.StringComparison]::OrdinalIgnoreCase)) {
                $Body = [System.Text.Encoding]::UTF8.GetBytes('Forbidden')
                Send-Response $Stream 403 'Forbidden' 'text/plain; charset=utf-8' $Body $HeadOnly
                continue
            }

            if (Test-Path -LiteralPath $RequestedFullPath -PathType Leaf) {
                $Body = [System.IO.File]::ReadAllBytes($RequestedFullPath)
                $ContentType = Get-ContentType $RequestedFullPath
                Send-Response $Stream 200 'OK' $ContentType $Body $HeadOnly
            } else {
                $Body = [System.Text.Encoding]::UTF8.GetBytes('File not found')
                Send-Response $Stream 404 'Not Found' 'text/plain; charset=utf-8' $Body $HeadOnly
            }
        } catch {
            try {
                if ($null -ne $Stream -and $Stream.CanWrite) {
                    $Body = [System.Text.Encoding]::UTF8.GetBytes('Server error')
                    Send-Response $Stream 500 'Internal Server Error' 'text/plain; charset=utf-8' $Body
                }
            } catch {
                # The browser may have closed the connection. No further action is needed.
            }
        } finally {
            if ($null -ne $Reader) {
                $Reader.Dispose()
            }
            if ($null -ne $Client) {
                $Client.Close()
            }
            $Reader = $null
            $Stream = $null
            $Client = $null
        }
    }
} finally {
    $Listener.Stop()
}
