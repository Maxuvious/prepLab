# PrepLab Backend API Tests Script (Improved Robust Version - Updated August 05, 2025)
# Run with: .\test-backend.ps1
# Assumes server is running on http://localhost:8000
# Outputs detailed True/False for each test with assertions on status, content, and edge cases
# Improvements:
# - Added test summary at the end with pass/fail count
# - Added tests for user role authentication and forbidden access
# - Enhanced error handling with more specific assertions
# - Parameterized baseUrl and added optional env var
# - Added tests for /api/reset-semester and invalid /api/tasks/check
# - Improved cleanup logging with suggestions
# - Sequential dependency handling: Skip related tests if creation fails
# - Increased num_results in web_search if needed, but not used here
# - Added tests for /api/theme GET and POST
# - Reset theme to default before theme tests to ensure consistency
# - Updated assertions for /api/theme to check colors['--bg'] instead of theme

$global:passed = 0
$global:failed = 0
$global:skipped = 0

function Test-Endpoint {
    param (
        [string]$Name,
        [string]$Method = "GET",
        [string]$Uri,
        [hashtable]$Headers = @{},
        [object]$Body = $null,
        [int]$ExpectedStatus = 200,
        [scriptblock]$AssertBody = $null,
        [switch]$ReturnResponse,
        [switch]$SkipIfFailedPrevious = $false
    )
    if ($SkipIfFailedPrevious -and $global:failed -gt 0) {
        Write-Host "Test ${Name}: Skipped (due to previous failure)" -ForegroundColor Yellow
        $global:skipped++
        return $null
    }
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
                    $global:failed++
                    return $null
                }
            }
            Write-Host "Test ${Name}: True" -ForegroundColor Green
            $global:passed++
            if ($ReturnResponse) {
                return @{ Status = $actualStatus; Body = $parsedBody; RawContent = $content }
            }
        } else {
            Write-Host "Test ${Name}: False (Status: $actualStatus, Expected: $ExpectedStatus, Content: $content)" -ForegroundColor Red
            $global:failed++
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
                    $global:failed++
                    return $null
                }
            }
            Write-Host "Test ${Name}: True" -ForegroundColor Green
            $global:passed++
            if ($ReturnResponse) {
                return @{ Status = $errStatus; Body = $parsedErrBody; RawContent = $errContent }
            }
        } else {
            Write-Host "Test ${Name}: False (Error: $($_.Exception.Message), Status: $errStatus, Content: $errContent)" -ForegroundColor Red
            $global:failed++
        }
    }
    return $null
}

Write-Host "Starting Improved Robust PrepLab Backend Tests (August 05, 2025)..." -ForegroundColor Yellow
if ($env:BASE_URL) { $baseUrl = $env:BASE_URL } else { $baseUrl = "http://localhost:8000" }
$testUserSuffix = (Get-Date).ToString("yyyyMMddHHmmss")
$testUsername = "testuser_$testUserSuffix"
$testPassword = "testpass"
$testRole = "user"
$testColor = "#00ff00"
$testClassName = "Test Class $testUserSuffix"
$testClassColor = "#ff00ff"
$testCardText = "Test Text"
$testEventTitle = "Test Event $testUserSuffix"
$testEventDate = "2025-08-10"
$testEventDesc = "Test Description"
$testCartName = "Test Cart $testUserSuffix"
$testCartCapacity = 50
$testCartUsage = 20
$testTheme = "catppuccin-mocha"
$cleanupIds = @{} # Store IDs for cleanup logging

# 1. Test /api/greet (GET - No Auth)
Test-Endpoint -Name "/api/greet" -Uri "$baseUrl/api/greet" -AssertBody { param($body, $content) if ($body.message -ne "Hello from Deno!") { throw "Invalid message" } }

# 2. Test /api/login - Invalid (Missing Fields, 400)
Test-Endpoint -Name "/api/login Missing Fields" -Method POST -Uri "$baseUrl/api/login" -Body @{} -ExpectedStatus 400

# 3. Test /api/login - Invalid Creds (401)
Test-Endpoint -Name "/api/login Invalid Creds" -Method POST -Uri "$baseUrl/api/login" -Body @{username="fake"; password="wrong"} -ExpectedStatus 401

# 4. Test /api/login - Valid Root (Get Token)
$rootLoginResponse = Test-Endpoint -Name "/api/login Valid Root" -Method POST -Uri "$baseUrl/api/login" -Body @{username="root"; password="rootpass"} -ReturnResponse -AssertBody { param($body, $content) if (!$body.token -or !$body.role -or $body.role -ne "root") { throw "Invalid login response" } }
if ($rootLoginResponse) {
    $rootToken = $rootLoginResponse.Body.token
    $rootAuthHeaders = @{"Authorization" = "Bearer $rootToken"}
} else {
    Write-Host "Failed to acquire root token. Skipping auth tests." -ForegroundColor Red
    return
}

# Reset theme to default for consistent testing
Test-Endpoint -Name "/api/theme Reset to Default" -Method POST -Uri "$baseUrl/api/theme" -Headers $rootAuthHeaders -Body @{theme="default"}

# 5. Test /api/users Unauthorized (401)
Test-Endpoint -Name "/api/users Unauthorized" -Uri "$baseUrl/api/users" -ExpectedStatus 401

# 6. Test /api/users GET (Root Only)
$usersResponse = Test-Endpoint -Name "/api/users GET" -Uri "$baseUrl/api/users" -Headers $rootAuthHeaders -ReturnResponse -AssertBody { param($body, $content) if ($body.Count -lt 2) { throw "Unexpected user count" } } # At least seed users

# 7. Test /api/users POST - Missing Fields (400)
Test-Endpoint -Name "/api/users POST Missing Fields" -Method POST -Uri "$baseUrl/api/users" -Headers $rootAuthHeaders -Body @{username=$testUsername} -ExpectedStatus 400

# 8. Test /api/users POST - Invalid Role/Color (400)
Test-Endpoint -Name "/api/users POST Invalid Role" -Method POST -Uri "$baseUrl/api/users" -Headers $rootAuthHeaders -Body @{username=$testUsername; password=$testPassword; role="invalid"; color=$testColor} -ExpectedStatus 400
Test-Endpoint -Name "/api/users POST Invalid Color" -Method POST -Uri "$baseUrl/api/users" -Headers $rootAuthHeaders -Body @{username=$testUsername; password=$testPassword; role=$testRole; color="invalid"} -ExpectedStatus 400

# 9. Test /api/users POST - Valid
$newUserResponse = Test-Endpoint -Name "/api/users POST Valid" -Method POST -Uri "$baseUrl/api/users" -Headers $rootAuthHeaders -Body @{username=$testUsername; password=$testPassword; role=$testRole; color=$testColor} -ReturnResponse
if ($newUserResponse.Status -eq 200) {
    $cleanupIds['userId'] = $testUsername # For manual delete
} else {
    Write-Host "User creation failed, skipping user-related tests" -ForegroundColor Yellow
}

# 10. Test /api/login - Valid User (Get User Token for Forbidden Tests)
$userLoginResponse = Test-Endpoint -Name "/api/login Valid User" -Method POST -Uri "$baseUrl/api/login" -Body @{username=$testUsername; password=$testPassword} -ReturnResponse -AssertBody { param($body, $content) if (!$body.token -or $body.role -ne "user") { throw "Invalid user login" } }
if ($userLoginResponse) {
    $userToken = $userLoginResponse.Body.token
    $userAuthHeaders = @{"Authorization" = "Bearer $userToken"}
}

# 11. Test Forbidden Access as User (e.g., /api/users GET)
if ($userToken) {
    Test-Endpoint -Name "/api/users GET Forbidden (User)" -Uri "$baseUrl/api/users" -Headers $userAuthHeaders -ExpectedStatus 403
}

# Continue with other tests using root token...

# 12. Test /api/users PUT - Invalid ID/Missing (404 or 400)
Test-Endpoint -Name "/api/users PUT Invalid ID" -Method PUT -Uri "$baseUrl/api/users" -Headers $rootAuthHeaders -Body @{id=999999; username="updated"} -ExpectedStatus 404
Test-Endpoint -Name "/api/users PUT No Changes" -Method PUT -Uri "$baseUrl/api/users" -Headers $rootAuthHeaders -Body @{id=1} -ExpectedStatus 400 -AssertBody { param($body, $content) if ($body.error -ne "No changes provided") { throw "Unexpected error message: $content" } }

# 13. Fetch Users Again to Get Test User ID
$usersAfterPost = Test-Endpoint -Name "/api/users GET After POST" -Uri "$baseUrl/api/users" -Headers $rootAuthHeaders -ReturnResponse
$testUserId = ($usersAfterPost.Body | Where-Object { $_.username -eq $testUsername }).id
if (!$testUserId) { Write-Host "Failed to find test user ID. Skipping related tests." -ForegroundColor Red; return }
$cleanupIds['userId'] = $testUserId

# 14. Test /api/users PUT - Valid
Test-Endpoint -Name "/api/users PUT Valid" -Method PUT -Uri "$baseUrl/api/users" -Headers $rootAuthHeaders -Body @{id=$testUserId; username="updated_$testUserSuffix"; color="#ff0000"}

# 15. Test /api/classes GET No Auth
Test-Endpoint -Name "/api/classes GET No Auth" -Uri "$baseUrl/api/classes" -AssertBody { param($body, $content) if ($body.Count -lt 2) { throw "Unexpected class count" } }

# 16. Test /api/classes POST - Unauthorized (401)
Test-Endpoint -Name "/api/classes POST Unauthorized" -Method POST -Uri "$baseUrl/api/classes" -Body @{name=$testClassName; color=$testClassColor} -ExpectedStatus 401

# 17. Test /api/classes POST - Missing Fields (400)
Test-Endpoint -Name "/api/classes POST Missing Fields" -Method POST -Uri "$baseUrl/api/classes" -Headers $rootAuthHeaders -Body @{name=$testClassName} -ExpectedStatus 400

# 18. Test /api/classes POST - Invalid Color (400)
Test-Endpoint -Name "/api/classes POST Invalid Color" -Method POST -Uri "$baseUrl/api/classes" -Headers $rootAuthHeaders -Body @{name=$testClassName; color="invalid"} -ExpectedStatus 400

# 19. Test /api/classes POST - Valid
Test-Endpoint -Name "/api/classes POST Valid" -Method POST -Uri "$baseUrl/api/classes" -Headers $rootAuthHeaders -Body @{name=$testClassName; color=$testClassColor}

# 20. Fetch Classes to Get Test Class ID
$classesAfterPost = Test-Endpoint -Name "/api/classes GET After POST" -Uri "$baseUrl/api/classes" -Headers $rootAuthHeaders -ReturnResponse
$testClassId = ($classesAfterPost.Body | Where-Object { $_.name -eq $testClassName }).id
if (!$testClassId) { Write-Host "Failed to find test class ID. Skipping related tests." -ForegroundColor Red; return }
$cleanupIds['classId'] = $testClassId

# 21. Test /api/classes PUT - Invalid ID (404)
Test-Endpoint -Name "/api/classes PUT Invalid ID" -Method PUT -Uri "$baseUrl/api/classes" -Headers $rootAuthHeaders -Body @{id=999999; name="updated"} -ExpectedStatus 404

# 22. Test /api/classes PUT - No Changes (400)
Test-Endpoint -Name "/api/classes PUT No Changes" -Method PUT -Uri "$baseUrl/api/classes" -Headers $rootAuthHeaders -Body @{id=$testClassId} -ExpectedStatus 400

# 23. Test /api/classes PUT - Valid
Test-Endpoint -Name "/api/classes PUT Valid" -Method PUT -Uri "$baseUrl/api/classes" -Headers $rootAuthHeaders -Body @{id=$testClassId; name="Updated $testClassName"; color="#00ff00"}

# 24. Test /api/equipment GET
Test-Endpoint -Name "/api/equipment GET" -Uri "$baseUrl/api/equipment" -AssertBody { param($body, $content) if ($body.Count -lt 3) { throw "Unexpected equipment count" } }

# 25. Test /api/cards GET ?items=1
$cardsResponse = Test-Endpoint -Name "/api/cards GET ?items=1" -Uri "$baseUrl/api/cards?items=1" -ReturnResponse -AssertBody { param($body, $content) if ($body.Count -lt 2) { throw "Unexpected card count" } }

# 26. Test /api/cards GET with class_id
Test-Endpoint -Name "/api/cards GET with class_id" -Uri "$baseUrl/api/cards?items=1&class_id=$testClassId" -AssertBody { param($body, $content) if ($body.Count -ne 0) { throw "Unexpected cards for new class" } } # New class has no cards yet

# 27. Test /api/cards POST Missing Fields (400)
Test-Endpoint -Name "/api/cards POST Missing Fields" -Method POST -Uri "$baseUrl/api/cards" -Headers $rootAuthHeaders -Body @{class_id=$testClassId} -ExpectedStatus 400

# 28. Test /api/cards POST Invalid class_id (400)
Test-Endpoint -Name "/api/cards POST Invalid class_id" -Method POST -Uri "$baseUrl/api/cards" -Headers $rootAuthHeaders -Body @{class_id=999999; card_text=$testCardText} -ExpectedStatus 400 -AssertBody { param($body, $content) if ($body.error -ne "Class not found") { throw "Unexpected error" } }

# 29. Test /api/cards POST - Valid
Test-Endpoint -Name "/api/cards POST Valid" -Method POST -Uri "$baseUrl/api/cards" -Headers $rootAuthHeaders -Body @{class_id=$testClassId; card_text=$testCardText}

# 30. Fetch Cards Again to Get Test Card ID
$cardsAfterPost = Test-Endpoint -Name "/api/cards GET After POST" -Uri "$baseUrl/api/cards?items=1" -ReturnResponse
$testCardId = ($cardsAfterPost.Body | Where-Object { $_.class -eq "Updated $testClassName" }).id
if (!$testCardId) { Write-Host "Failed to find test card ID. Skipping related tests." -ForegroundColor Red; return }
$cleanupIds['cardId'] = $testCardId

# 31. Test /api/cards PUT - Invalid ID (404)
Test-Endpoint -Name "/api/cards PUT Invalid ID" -Method PUT -Uri "$baseUrl/api/cards" -Headers $rootAuthHeaders -Body @{id=999999; class_id=$testClassId; card_text="updated"} -ExpectedStatus 404

# 32. Test /api/cards PUT - Valid
Test-Endpoint -Name "/api/cards PUT Valid" -Method PUT -Uri "$baseUrl/api/cards" -Headers $rootAuthHeaders -Body @{id=$testCardId; class_id=$testClassId; card_text="Updated $testCardText"}

# 33. Test /api/change-requests POST - Invalid Card ID (404)
Test-Endpoint -Name "/api/change-requests POST Invalid Card ID" -Method POST -Uri "$baseUrl/api/change-requests" -Headers $rootAuthHeaders -Body @{card_id=999999; class="suggest"; card_text="suggest"} -ExpectedStatus 404

# 34. Test /api/change-requests POST - Missing Fields (400)
Test-Endpoint -Name "/api/change-requests POST Missing Fields" -Method POST -Uri "$baseUrl/api/change-requests" -Headers $rootAuthHeaders -Body @{card_id=$testCardId} -ExpectedStatus 400

# 35. Test /api/change-requests POST - Valid
Test-Endpoint -Name "/api/change-requests POST Valid" -Method POST -Uri "$baseUrl/api/change-requests" -Headers $rootAuthHeaders -Body @{card_id=$testCardId; class="Suggested Class"; card_text="Suggested Text"}

# 36. Test /api/change-requests GET
$requestsResponse = Test-Endpoint -Name "/api/change-requests GET" -Uri "$baseUrl/api/change-requests" -Headers $rootAuthHeaders -ReturnResponse -AssertBody { param($body, $content) if ($body.Count -eq 0) { throw "No requests found after submit" } }

# 37. Get Test Request ID
$testRequestId = $requestsResponse.Body[-1].id # Last one
if (!$testRequestId) { Write-Host "Failed to find test request ID. Skipping approve/reject." -ForegroundColor Red } else {
    $cleanupIds['requestId'] = $testRequestId
    # 38. Test /api/change-requests/approve - Invalid ID (404)
    Test-Endpoint -Name "/api/change-requests/approve Invalid ID" -Method POST -Uri "$baseUrl/api/change-requests/approve" -Headers $rootAuthHeaders -Body @{requestId=999999} -ExpectedStatus 404

    # 39. Test /api/change-requests/approve - Valid
    Test-Endpoint -Name "/api/change-requests/approve Valid" -Method POST -Uri "$baseUrl/api/change-requests/approve" -Headers $rootAuthHeaders -Body @{requestId=$testRequestId}

    # 40. Test /api/change-requests/reject - After Approve (Submit another for reject)
    Test-Endpoint -Name "/api/change-requests POST For Reject" -Method POST -Uri "$baseUrl/api/change-requests" -Headers $rootAuthHeaders -Body @{card_id=$testCardId; class="Reject Me"; card_text="Reject Text"}
    $newRequests = Test-Endpoint -Name "/api/change-requests GET For Reject" -Uri "$baseUrl/api/change-requests" -Headers $rootAuthHeaders -ReturnResponse
    $rejectId = $newRequests.Body[-1].id
    if ($rejectId) {
        Test-Endpoint -Name "/api/change-requests/reject Valid" -Method POST -Uri "$baseUrl/api/change-requests/reject" -Headers $rootAuthHeaders -Body @{requestId=$rejectId}
    }
}

# 41. Test /api/tasks/check - Invalid Body (400)
Test-Endpoint -Name "/api/tasks/check Invalid Body" -Method POST -Uri "$baseUrl/api/tasks/check" -Headers $rootAuthHeaders -Body @{taskId="invalid"; checked=$true} -ExpectedStatus 400

# 42. Test /api/tasks/check - Invalid Task ID (404)
Test-Endpoint -Name "/api/tasks/check Invalid Task ID" -Method POST -Uri "$baseUrl/api/tasks/check" -Headers $rootAuthHeaders -Body @{taskId=999999; checked=$true} -ExpectedStatus 404 -AssertBody { param($body, $content) if ($body.error -ne "Task not found") { throw "Unexpected error" } }

# 43. Test /api/tasks/check - Valid Check/Uncheck (assume task 1 from seed)
Test-Endpoint -Name "/api/tasks/check True" -Method POST -Uri "$baseUrl/api/tasks/check" -Headers $rootAuthHeaders -Body @{taskId=1; checked=$true}
Test-Endpoint -Name "/api/tasks/check False" -Method POST -Uri "$baseUrl/api/tasks/check" -Headers $rootAuthHeaders -Body @{taskId=1; checked=$false}

# 44. Test /api/reset-semester - Forbidden as User
if ($userToken) {
    Test-Endpoint -Name "/api/reset-semester Forbidden (User)" -Method POST -Uri "$baseUrl/api/reset-semester" -Headers $userAuthHeaders -ExpectedStatus 403
}

# 45. Test /api/reset-semester - Valid as Root
Test-Endpoint -Name "/api/reset-semester Valid" -Method POST -Uri "$baseUrl/api/reset-semester" -Headers $rootAuthHeaders

# 46. Test /api/events GET
Test-Endpoint -Name "/api/events GET" -Uri "$baseUrl/api/events" -AssertBody { param($body, $content) if ($body.Count -lt 2) { throw "Unexpected event count" } }

# 47. Test /api/events POST - Missing Fields (400)
Test-Endpoint -Name "/api/events POST Missing Fields" -Method POST -Uri "$baseUrl/api/events" -Headers $rootAuthHeaders -Body @{title=$testEventTitle} -ExpectedStatus 400

# 48. Test /api/events POST - Invalid Date (400)
Test-Endpoint -Name "/api/events POST Invalid Date" -Method POST -Uri "$baseUrl/api/events" -Headers $rootAuthHeaders -Body @{title=$testEventTitle; date="invalid"} -ExpectedStatus 400

# 49. Test /api/events POST - Valid
Test-Endpoint -Name "/api/events POST Valid" -Method POST -Uri "$baseUrl/api/events" -Headers $rootAuthHeaders -Body @{title=$testEventTitle; date=$testEventDate; description=$testEventDesc}

# 50. Fetch Events to Get Test Event ID
$eventsAfterPost = Test-Endpoint -Name "/api/events GET After POST" -Uri "$baseUrl/api/events" -Headers $rootAuthHeaders -ReturnResponse
$testEventId = ($eventsAfterPost.Body | Where-Object { $_.title -eq $testEventTitle }).id
if ($testEventId) { $cleanupIds['eventId'] = $testEventId }

# 51. Test /api/events PUT - Invalid ID (404)
Test-Endpoint -Name "/api/events PUT Invalid ID" -Method PUT -Uri "$baseUrl/api/events" -Headers $rootAuthHeaders -Body @{id=999999; title="updated"; date="2025-08-10"} -ExpectedStatus 404

# 52. Test /api/events PUT - Valid (if ID found)
if ($testEventId) {
    Test-Endpoint -Name "/api/events PUT Valid" -Method PUT -Uri "$baseUrl/api/events" -Headers $rootAuthHeaders -Body @{id=$testEventId; title="Updated $testEventTitle"; date=$testEventDate}
}

# 53. Test /api/carts GET
Test-Endpoint -Name "/api/carts GET" -Uri "$baseUrl/api/carts" -AssertBody { param($body, $content) if ($body.Count -lt 2) { throw "Unexpected cart count" } }

# 54. Test /api/carts POST - Missing Fields (400)
Test-Endpoint -Name "/api/carts POST Missing Fields" -Method POST -Uri "$baseUrl/api/carts" -Headers $rootAuthHeaders -Body @{name=$testCartName} -ExpectedStatus 400

# 55. Test /api/carts POST - Invalid Capacity (400)
Test-Endpoint -Name "/api/carts POST Invalid Capacity" -Method POST -Uri "$baseUrl/api/carts" -Headers $rootAuthHeaders -Body @{name=$testCartName; capacity=-10} -ExpectedStatus 400

# 56. Test /api/carts POST - Valid
Test-Endpoint -Name "/api/carts POST Valid" -Method POST -Uri "$baseUrl/api/carts" -Headers $rootAuthHeaders -Body @{name=$testCartName; capacity=$testCartCapacity; current_usage=$testCartUsage}

# 57. Fetch Carts to Get Test Cart ID
$cartsAfterPost = Test-Endpoint -Name "/api/carts GET After POST" -Uri "$baseUrl/api/carts" -Headers $rootAuthHeaders -ReturnResponse
$testCartId = ($cartsAfterPost.Body | Where-Object { $_.name -eq $testCartName }).id
if ($testCartId) { $cleanupIds['cartId'] = $testCartId }

# 58. Test /api/carts PUT - Invalid ID (404)
Test-Endpoint -Name "/api/carts PUT Invalid ID" -Method PUT -Uri "$baseUrl/api/carts" -Headers $rootAuthHeaders -Body @{id=999999; name="updated"} -ExpectedStatus 404

# 59. Test /api/carts PUT - No Changes (400)
Test-Endpoint -Name "/api/carts PUT No Changes" -Method PUT -Uri "$baseUrl/api/carts" -Headers $rootAuthHeaders -Body @{id=$testCartId} -ExpectedStatus 400

# 60. Test /api/carts PUT - Valid (if ID found)
if ($testCartId) {
    Test-Endpoint -Name "/api/carts PUT Valid" -Method PUT -Uri "$baseUrl/api/carts" -Headers $rootAuthHeaders -Body @{id=$testCartId; name="Updated $testCartName"; capacity=60}
}

# 61. Test /api/theme GET No Auth
Test-Endpoint -Name "/api/theme GET No Auth" -Uri "$baseUrl/api/theme" -AssertBody { param($body, $content) if ($body.colors.'--bg' -ne "#f3f4f6") { throw "Unexpected default theme bg" } }

# 62. Test /api/theme POST - Unauthorized (401)
Test-Endpoint -Name "/api/theme POST Unauthorized" -Method POST -Uri "$baseUrl/api/theme" -Body @{theme=$testTheme} -ExpectedStatus 401

# 63. Test /api/theme POST - Invalid Body (400)
Test-Endpoint -Name "/api/theme POST Invalid Body" -Method POST -Uri "$baseUrl/api/theme" -Headers $rootAuthHeaders -Body @{theme=123} -ExpectedStatus 400

# 64. Test /api/theme POST - Valid
Test-Endpoint -Name "/api/theme POST Valid" -Method POST -Uri "$baseUrl/api/theme" -Headers $rootAuthHeaders -Body @{theme=$testTheme}

# 65. Test /api/theme GET After POST
Test-Endpoint -Name "/api/theme GET After POST" -Uri "$baseUrl/api/theme" -AssertBody { param($body, $content) if ($body.colors.'--bg' -ne "#1e1e2e") { throw "Theme not updated, bg should be mocha" } }

# 66. Test Static File Serving (/auth.js)
Test-Endpoint -Name "/auth.js Static" -Uri "$baseUrl/auth.js" -AssertBody { param($body, $raw) if (!$raw.Contains("handleLogin")) { throw "Invalid content" } }

# Test Summary
Write-Host "`nTest Summary:" -ForegroundColor Cyan
Write-Host "Passed: $global:passed" -ForegroundColor Green
Write-Host "Failed: $global:failed" -ForegroundColor Red
Write-Host "Skipped: $global:skipped" -ForegroundColor Yellow
Write-Host "Total: $($global:passed + $global:failed + $global:skipped)"

# Cleanup: Since no DELETE endpoints, log for manual cleanup
Write-Host "Cleanup: Manually delete created resources if needed:" -ForegroundColor Yellow
$cleanupIds.GetEnumerator() | ForEach-Object { Write-Host "$($_.Key): $($_.Value)" }
Write-Host "Reset theme if needed: UPDATE global_settings SET value = 'default' WHERE key = 'theme';"
Write-Host "All tests completed." -ForegroundColor Yellow
