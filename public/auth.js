let token = localStorage.getItem('token') || '';
let role = localStorage.getItem('role') || '';

async function handleLogin() {
  const username = document.getElementById('user').value.trim();
  const password = document.getElementById('pass').value;
  const loginError = document.getElementById('loginError');

  if (!username || !password) {
    loginError.textContent = 'Username and password are required';
    loginError.classList.remove('hidden');
    return;
  }

  console.log('Login attempt:', { username }); // Debug - avoid logging password
  loginError.classList.add('hidden');
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Server error' }));
      throw new Error(errorData.error || 'Login failed');
    }

    const data = await res.json();
    token = data.token;
    role = data.role;
    localStorage.setItem('token', token);
    localStorage.setItem('role', role);
  } catch (err) {
    console.error('Login failed:', err);
    loginError.textContent = err.message || 'Network error or invalid credentials';
    loginError.classList.remove('hidden');
    throw err;
  }
}

export { handleLogin, token, role };
