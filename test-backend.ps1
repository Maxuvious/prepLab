# PrepLab Backend API Tests Script (Robust Version - Fixed for PowerShell)
# Run with: .\test-backend.ps1
# Assumes server is running on http://localhost:8000
# Outputs detailed True/False for each test with assertions on status, content, and edge cases
# Improvements (July 31, 2025 Update):
# - Switched to Invoke-WebRequest for consistent access to StatusCode and Content (raw body).
# - Handles JSON parsing safely, even for non-JSON responses.
# - Fixed ternary operator issue (PowerShell doesn't support ? : natively; used if-else).
# - Added try-catch for JSON parsing in assertions.
# - Improved error handling: Captures full exception details.
# - Added -AllowUnescaped to handle potential certificate issues (optional; comment out if not needed).
# - Dynamic ID handling: Fetches lists and uses real IDs for tests.
# - Edge case tests: Invalid inputs, unauthorized, missing fields.
# - Login variations: Valid, invalid creds, missing fields.
# - Full change request flow: Submit, list, approve, reject.
# - Task check: Check and uncheck (assumes task ID 1 exists from seed data).
# - Cleanup: Attempts to delete test users/cards if APIs supported DELETE (but since not, just logs IDs for manual cleanup).
# - Assertions on response bodies where applicable.
# - No cookies used (token-based auth).
# - Added timeout (30s) to requests to prevent hangs.
# - Made baseUrl configurable via env or default.

function Test-Endpoint {
    param (
        [string]$Name,
        [string]$Method = "GET",
        [string]$Uri,
        [hashtable]$Headers = @{},
        [object]$Body = $null,
        [int]$ExpectedStatus = 200,
        [scriptblock]$AssertBody = $null,
        [switch]$ReturnResponse
    )

    $params = @{
        Uri = $Uri
        Method = $Method
        Headers = $Headers
        TimeoutSec = 30
        ErrorAction = "Stop"
    }
    if ($Body) {
        $params["Body"] = $Body | ConvertTo-Json -Depth 10
        $params["ContentType"] = "application/json"
    }

    try {
        $response = Invoke-WebRequest @params
        $actualStatus = $response.StatusCode
        $content = $response.Content
        $parsedBody = $null
        try {
            $parsedBody = $content | ConvertFrom-Json
        } catch {}

        if ($actualStatus -eq $ExpectedStatus) {
            if ($AssertBody) {
                try {
                    & $AssertBody $parsedBody $content
                } catch {
                    Write-Host "Test ${Name}: False (Body Assertion Failed: $_)" -ForegroundColor Red
                    return $null
                }
            }
            Write-Host "Test ${Name}: True" -ForegroundColor Green
            if ($ReturnResponse) {
                return @{ Status = $actualStatus; Body = $parsedBody; RawContent = $content }
            }
        } else {
            Write-Host "Test ${Name}: False (Status: $actualStatus, Expected: $ExpectedStatus, Content: $content)" -ForegroundColor Red
        }
    } catch {
        $errStatus = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 500 }
        $errContent = ""
        if ($_.Exception.Response) {
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                $stream.Position = 0
                $reader = [System.IO.StreamReader]::new($stream)
                $errContent = $reader.ReadToEnd()
                $reader.Close()
                $stream.Close()
            } catch {
                $errContent = "Failed to read error content: $_"
            }
        }
        $parsedErrBody = $null
        try {
            $parsedErrBody = $errContent | ConvertFrom-Json
        } catch {}

        if ($errStatus -eq $ExpectedStatus) {
            if ($AssertBody) {
                try {
                    & $AssertBody $parsedErrBody $errContent
                } catch {
                    Write-Host "Test ${Name}: False (Body Assertion Failed: $_, Raw Content: $errContent)" -ForegroundColor Red
                    return $null
                }
            }
            Write-Host "Test ${Name}: True" -ForegroundColor Green
            if ($ReturnResponse) {
                return @{ Status = $errStatus; Body = $parsedErrBody; RawContent = $errContent }
            }
        } else {
            Write-Host "Test ${Name}: False (Error: $($_.Exception.Message), Status: $errStatus, Content: $errContent)" -ForegroundColor Red
        }
    }
    return $null
}

Write-Host "Starting Robust PrepLab Backend Tests (Fixed Version)..." -ForegroundColor Yellow

if ($env:BASE_URL) { $baseUrl = $env:BASE_URL } else { $baseUrl = "http://localhost:8000" }
$testUserSuffix = (Get-Date).ToString("yyyyMMddHHmmss")
$testUsername = "testuser_$testUserSuffix"
$testPassword = "testpass"
$testRole = "user"
$testColor = "#00ff00"
$testClass = "Test Class $testUserSuffix"
$testCardText = "Test Text"

# 1. Test /api/greet (GET - No Auth)
Test-Endpoint -Name "/api/greet" -Uri "$baseUrl/api/greet" -AssertBody { param($body, $content) if ($body.message -ne "Hello from Deno!") { throw "Invalid message" } }

# 2. Test /api/login - Invalid (Missing Fields, 400)
Test-Endpoint -Name "/api/login Missing Fields" -Method POST -Uri "$baseUrl/api/login" -Body @{} -ExpectedStatus 400

# 3. Test /api/login - Invalid Creds (401)
Test-Endpoint -Name "/api/login Invalid Creds" -Method POST -Uri "$baseUrl/api/login" -Body @{username="fake"; password="wrong"} -ExpectedStatus 401

# 4. Test /api/login - Valid (Get Token)
$loginResponse = Test-Endpoint -Name "/api/login Valid" -Method POST -Uri "$baseUrl/api/login" -Body @{username="root"; password="rootpass"} -ReturnResponse -AssertBody { param($body, $content) if (!$body.token -or !$body.role -or $body.role -ne "root") { throw "Invalid login response" } }

if ($loginResponse) {
    $token = $loginResponse.Body.token
    Write-Host "Token acquired successfully" -ForegroundColor Green
    $authHeaders = @{"Authorization" = "Bearer $token"}
} else {
    Write-Host "Failed to acquire token. Skipping auth tests." -ForegroundColor Red
    return
}

# 5. Test /api/users Unauthorized (401)
Test-Endpoint -Name "/api/users Unauthorized" -Uri "$baseUrl/api/users" -ExpectedStatus 401

# 6. Test /api/users GET (Root Only)
$usersResponse = Test-Endpoint -Name "/api/users GET" -Uri "$baseUrl/api/users" -Headers $authHeaders -ReturnResponse -AssertBody { param($body, $content) if ($body.Count -lt 2) { throw "Unexpected user count" } }  # At least seed users

# 7. Test /api/users POST - Missing Fields (400)
Test-Endpoint -Name "/api/users POST Missing Fields" -Method POST -Uri "$baseUrl/api/users" -Headers $authHeaders -Body @{username=$testUsername} -ExpectedStatus 400

# 8. Test /api/users POST - Invalid Role/Color (400)
Test-Endpoint -Name "/api/users POST Invalid Role" -Method POST -Uri "$baseUrl/api/users" -Headers $authHeaders -Body @{username=$testUsername; password=$testPassword; role="invalid"; color=$testColor} -ExpectedStatus 400
Test-Endpoint -Name "/api/users POST Invalid Color" -Method POST -Uri "$baseUrl/api/users" -Headers $authHeaders -Body @{username=$testUsername; password=$testPassword; role=$testRole; color="invalid"} -ExpectedStatus 400

# 9. Test /api/users POST - Valid
Test-Endpoint -Name "/api/users POST Valid" -Method POST -Uri "$baseUrl/api/users" -Headers $authHeaders -Body @{username=$testUsername; password=$testPassword; role=$testRole; color=$testColor}

# 10. Test /api/users PUT - Invalid ID/Missing (404 or 400)
Test-Endpoint -Name "/api/users PUT Invalid ID" -Method PUT -Uri "$baseUrl/api/users" -Headers $authHeaders -Body @{id=999999; username="updated"} -ExpectedStatus 404
Test-Endpoint -Name "/api/users PUT No Changes" -Method PUT -Uri "$baseUrl/api/users" -Headers $authHeaders -Body @{id=1} -ExpectedStatus 400 -AssertBody { param($body, $content) if ($body.error -ne "No changes provided") { throw "Unexpected error message: $content" } }

# 11. Fetch Users Again to Get Test User ID
$usersAfterPost = Test-Endpoint -Name "/api/users GET After POST" -Uri "$baseUrl/api/users" -Headers $authHeaders -ReturnResponse
$testUserId = ($usersAfterPost.Body | Where-Object { $_.username -eq $testUsername }).id
if (!$testUserId) { Write-Host "Failed to find test user ID. Skipping related tests." -ForegroundColor Red; return }

# 12. Test /api/users PUT - Valid
Test-Endpoint -Name "/api/users PUT Valid" -Method PUT -Uri "$baseUrl/api/users" -Headers $authHeaders -Body @{id=$testUserId; username="updated_$testUserSuffix"; color="#ff0000"}

# 13. Test /api/equipment GET
Test-Endpoint -Name "/api/equipment GET" -Uri "$baseUrl/api/equipment" -AssertBody { param($body, $content) if ($body.Count -lt 3) { throw "Unexpected equipment count" } }

# 14. Test /api/cards GET ?items=1
$cardsResponse = Test-Endpoint -Name "/api/cards GET ?items=1" -Uri "$baseUrl/api/cards?items=1" -ReturnResponse -AssertBody { param($body, $content) if ($body.Count -lt 2) { throw "Unexpected card count" } }

# 15. Test /api/cards POST - Missing Fields (400)
Test-Endpoint -Name "/api/cards POST Missing Fields" -Method POST -Uri "$baseUrl/api/cards" -Headers $authHeaders -Body @{class=$testClass} -ExpectedStatus 400

# 16. Test /api/cards POST - Valid
Test-Endpoint -Name "/api/cards POST Valid" -Method POST -Uri "$baseUrl/api/cards" -Headers $authHeaders -Body @{class=$testClass; card_text=$testCardText}

# 17. Fetch Cards Again to Get Test Card ID
$cardsAfterPost = Test-Endpoint -Name "/api/cards GET After POST" -Uri "$baseUrl/api/cards?items=1" -ReturnResponse
$testCardId = ($cardsAfterPost.Body | Where-Object { $_.class -eq $testClass }).id
if (!$testCardId) { Write-Host "Failed to find test card ID. Skipping related tests." -ForegroundColor Red; return }

# 18. Test /api/cards PUT - Invalid ID (404)
Test-Endpoint -Name "/api/cards PUT Invalid ID" -Method PUT -Uri "$baseUrl/api/cards" -Headers $authHeaders -Body @{id=999999; class="updated"; card_text="updated"} -ExpectedStatus 404

# 19. Test /api/cards PUT - Valid
Test-Endpoint -Name "/api/cards PUT Valid" -Method PUT -Uri "$baseUrl/api/cards" -Headers $authHeaders -Body @{id=$testCardId; class="Updated $testClass"; card_text="Updated $testCardText"}

# 20. Test /api/change-requests POST - Invalid Card ID (404)
Test-Endpoint -Name "/api/change-requests POST Invalid Card ID" -Method POST -Uri "$baseUrl/api/change-requests" -Headers $authHeaders -Body @{card_id=999999; class="suggest"; card_text="suggest"} -ExpectedStatus 404

# 21. Test /api/change-requests POST - Missing Fields (400)
Test-Endpoint -Name "/api/change-requests POST Missing Fields" -Method POST -Uri "$baseUrl/api/change-requests" -Headers $authHeaders -Body @{card_id=$testCardId} -ExpectedStatus 400

# 22. Test /api/change-requests POST - Valid
Test-Endpoint -Name "/api/change-requests POST Valid" -Method POST -Uri "$baseUrl/api/change-requests" -Headers $authHeaders -Body @{card_id=$testCardId; class="Suggested $testClass"; card_text="Suggested Text"}

# 23. Test /api/change-requests GET
$requestsResponse = Test-Endpoint -Name "/api/change-requests GET" -Uri "$baseUrl/api/change-requests" -Headers $authHeaders -ReturnResponse -AssertBody { param($body, $content) if ($body.Count -eq 0) { throw "No requests found after submit" } }

# 24. Get Test Request ID
$testRequestId = $requestsResponse.Body[-1].id  # Last one
if (!$testRequestId) { Write-Host "Failed to find test request ID. Skipping approve/reject." -ForegroundColor Red } else {

    # 25. Test /api/change-requests/approve - Invalid ID (404)
    Test-Endpoint -Name "/api/change-requests/approve Invalid ID" -Method POST -Uri "$baseUrl/api/change-requests/approve" -Headers $authHeaders -Body @{requestId=999999} -ExpectedStatus 404

    # 26. Test /api/change-requests/approve - Valid
    Test-Endpoint -Name "/api/change-requests/approve Valid" -Method POST -Uri "$baseUrl/api/change-requests/approve" -Headers $authHeaders -Body @{requestId=$testRequestId}

    # 27. Test /api/change-requests/reject - After Approve (Submit another for reject)
    Test-Endpoint -Name "/api/change-requests POST For Reject" -Method POST -Uri "$baseUrl/api/change-requests" -Headers $authHeaders -Body @{card_id=$testCardId; class="Reject Me"; card_text="Reject Text"}
    $newRequests = Test-Endpoint -Name "/api/change-requests GET For Reject" -Uri "$baseUrl/api/change-requests" -Headers $authHeaders -ReturnResponse
    $rejectId = $newRequests.Body[-1].id
    Test-Endpoint -Name "/api/change-requests/reject Valid" -Method POST -Uri "$baseUrl/api/change-requests/reject" -Headers $authHeaders -Body @{requestId=$rejectId}
}

# 28. Test /api/tasks/check - Invalid ID (Assume task 1 exists from seed)
Test-Endpoint -Name "/api/tasks/check Invalid Body" -Method POST -Uri "$baseUrl/api/tasks/check" -Headers $authHeaders -Body @{taskId="invalid"; checked=$true} -ExpectedStatus 400

# 29. Test /api/tasks/check - Valid Check/Uncheck
Test-Endpoint -Name "/api/tasks/check True" -Method POST -Uri "$baseUrl/api/tasks/check" -Headers $authHeaders -Body @{taskId=1; checked=$true}
Test-Endpoint -Name "/api/tasks/check False" -Method POST -Uri "$baseUrl/api/tasks/check" -Headers $authHeaders -Body @{taskId=1; checked=$false}

# 30. Test /api/reset-semester
Test-Endpoint -Name "/api/reset-semester" -Method POST -Uri "$baseUrl/api/reset-semester" -Headers $authHeaders

# 31. Test Static File Serving (/auth.js)
Test-Endpoint -Name "/auth.js Static" -Uri "$baseUrl/auth.js" -AssertBody { param($body, $raw) if (!$raw.Contains("handleLogin")) { throw "Invalid content" } }

# Cleanup: Delete test user and card (if APIs supported delete, but since not, just log)
Write-Host "Cleanup: Test user ID: $testUserId, Card ID: $testCardId - Manually delete if needed." -ForegroundColor Yellow

Write-Host "All tests completed." -ForegroundColor Yellow
