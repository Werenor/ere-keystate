$ErrorActionPreference='Stop'
New-Item -ItemType Directory -Path "$PSScriptRoot\plugin","$PSScriptRoot\dist" -Force | Out-Null
& "$env:WINDIR/Microsoft.NET/Framework64/v4.0.30319/csc.exe" /nologo /platform:x64 /target:exe /optimize+ "/out:$PSScriptRoot\plugin/KeyStateProbe.exe" "$PSScriptRoot\KeyStateProbe.cs"
if($LASTEXITCODE -ne 0){throw 'Native build failed'}
$m=Get-Content "$PSScriptRoot\manifest-template.json" -Raw | ConvertFrom-Json
foreach($file in $m.files){$file | Add-Member sha256 (Get-FileHash -LiteralPath (Join-Path "$PSScriptRoot\plugin" $file.source)).Hash.ToLowerInvariant() -Force}
[IO.File]::WriteAllText("$PSScriptRoot\plugin/plugin.json",($m|ConvertTo-Json -Depth 10),[Text.UTF8Encoding]::new($false))
Copy-Item "$PSScriptRoot\LICENSE" "$PSScriptRoot\plugin/LICENSE" -Force
Compress-Archive "$PSScriptRoot\plugin/*" "$PSScriptRoot\dist/ere-keystate-v1.1.0-win-x64.zip" -Force
$hash=(Get-FileHash "$PSScriptRoot\dist/ere-keystate-v1.1.0-win-x64.zip").Hash.ToLowerInvariant()
[IO.File]::WriteAllText("$PSScriptRoot\dist/SHA256SUMS.txt","$hash  ere-keystate-v1.1.0-win-x64.zip`n")
