$checks = @(
  @{ Name = "node"; Command = "node --version" },
  @{ Name = "npm"; Command = "npm --version" },
  @{ Name = "python"; Command = "python --version" },
  @{ Name = "pip"; Command = "pip --version" },
  @{ Name = "pwsh"; Command = "pwsh --version" }
)

foreach ($check in $checks) {
  try {
    $result = Invoke-Expression $check.Command 2>$null
    if ($LASTEXITCODE -eq 0 -or $result) {
      Write-Host ("[OK] {0}: {1}" -f $check.Name, ($result | Select-Object -First 1))
      continue
    }
  }
  catch {
  }

  Write-Host ("[MISSING] {0}" -f $check.Name)
}

try {
  python -c "import polars as pl; print(pl.__version__)" 2>$null | ForEach-Object {
    Write-Host ("[OK] polars: {0}" -f $_)
  }
}
catch {
  Write-Host "[MISSING] polars"
}
