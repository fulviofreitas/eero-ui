# 🛠️ Development

## Frontend Scripts

```bash
npm run dev           # Start dev server
npm run build         # Production build
npm run check         # TypeScript check
npm run lint          # Lint code
npm run format        # Format code
npm run test          # Run tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage
```

## Backend Scripts

```bash
uvicorn app.main:app --reload     # Dev server with hot reload
pytest                             # Run tests
pytest --cov=app --cov-report=html # Run tests with coverage
pytest -k "login"                  # Run tests matching pattern
```

## Testing

### Backend Testing

Uses pytest with pytest-asyncio for async test support:

- Tests in `backend/tests/`
- Fixtures in `conftest.py` mock the EeroClient
- Install dev deps: `pip install -e ".[dev]"`

### Frontend Testing

Uses Vitest with Testing Library and MSW for API mocking:

- Store and component tests in `src/lib/**/*.test.ts`
- MSW handlers in `tests/mocks/handlers.ts`

## Dependencies

This project depends on [eero-client](https://github.com/fulviofreitas/eero-client), a modern async Python client for the Eero API.

The dependency is automatically installed from GitHub when you install the backend.

> ⚠️ Do not copy eero-client code locally. Always reference it from GitHub.
