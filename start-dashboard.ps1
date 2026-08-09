$ErrorActionPreference = 'Stop'
$dashboard = Join-Path $PSScriptRoot 'index.html'
if (-not (Test-Path -LiteralPath $dashboard)) {
    throw "대시보드 파일을 찾을 수 없습니다: $dashboard"
}
$dashboardUri = ([System.Uri]::new($dashboard)).AbsoluteUri + '?demo=1'
Start-Process -FilePath $dashboardUri
