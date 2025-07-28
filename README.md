# prepLab

This repo contains a small example project using [Deno](https://deno.land) with a backend and a simple frontend.

## Requirements

- [Deno](https://deno.land/) >= 1.40 (or any recent version)

## Running the server

Use the built in task to start the server:

```bash
deno task start
```

```bash
deno run --allow-net --allow-read --allow-write start.ts
```

Make sure to include the `.ts` extension; running `deno run start` will fail
with a "module not found" error.

The server listens on http://localhost:8000 and serves:

- `GET /api/greet` - returns a greeting JSON message.
- `GET /api/equipment` - list of all stock equipment by room and drawer.
- `GET /api/cards` - list of prep lab cards. Add `?items=1` to include
  associated equipment.
- Static files from the `public` directory, including `index.html`.

Open your browser to [http://localhost:8000](http://localhost:8000) to see the
interactive interface. Use the search box to filter by class and view each card
along with the equipment and storage locations it requires.

## Authentication and Tasks

- POST /api/login returns a JWT for valid credentials.
- Authenticated users can check tasks via /api/tasks/check; updates broadcast over WebSockets.
- Root users can list all accounts via /api/users and reset task checks with /api/reset-semester.
- The frontend now shows a login form and live checkboxes with user-colored highlights.
