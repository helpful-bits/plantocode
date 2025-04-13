# SQLite Migration Guide

This document explains how we migrated the application's persistence layer from browser localStorage to SQLite using Next.js API routes.

## Overview

We replaced the browser's localStorage with a SQLite database for storing session data, user preferences, and application state. This provides several advantages:

- More storage capacity (no 5MB limit)
- Data persistence across browser sessions and refreshes
- Better performance for complex data operations
- Structured data storage with relations
- Improved reliability and data integrity

## Implementation Details

### Architecture

Since Next.js client components cannot directly use Node.js modules like `better-sqlite3`, we implemented a client-server architecture:

1. **Server-side**: SQLite database operations via Next.js API routes
2. **Client-side**: API client that communicates with the server

### Database Structure

The database has the following tables:

1. `sessions` - Stores complete session data including:
   - Session metadata (ID, name, creation time)
   - Project information
   - Search parameters
   - Content settings

2. `included_files` - Files included in a session (related to sessions)

3. `excluded_files` - Files excluded from a session (related to sessions)

4. `project_settings` - Project-specific settings like active session ID

5. `cached_state_items` - Individual cached state values for form fields

### Server-Side Implementation

- Database is stored in `~/.o1-pro-flow/o1-pro-flow.db`
- Migration system using Drizzle ORM
- API routes for all database operations:
  - `/api/sessions` - List, create, and delete sessions
  - `/api/session` - Get a single session by ID
  - `/api/project-settings` - Manage active session IDs
  - `/api/cached-state` - Store and retrieve cached state values
  - `/api/migrate` - Handle data migration from localStorage

### Client-Side Implementation

- `DatabaseContext` provides a client interface to the API routes
- Components use the `useDatabase` hook to access the database client
- Automatic data migration from localStorage on first load
- Loading indicators while database initializes

### Data Migration

When the application first loads:

1. Client collects all localStorage data with the `o1-pro-flow` prefix
2. Data is sent to the server via the `/api/migrate` endpoint
3. Server imports the data into SQLite
4. Client shows a loading indicator during initialization
5. Once complete, the app renders with data from SQLite

## Benefits

- **Persistence**: Data remains available even after browser refreshes or closures
- **Performance**: Better performance for larger datasets
- **Storage**: No 5MB localStorage limit
- **Structure**: Better organization of related data
- **Reliability**: Greater resilience against data loss

## Technical Notes

- Uses `better-sqlite3` on the server side only
- Uses `drizzle-orm` for ORM functionality
- Implements repository pattern for clean data access
- Uses Next.js API routes to create a REST API for the database
- Handles migrations safely with error handling
- Includes debug logging for troubleshooting

## Future Improvements

- Add database backup and restore functionality
- Implement data compression for large text fields
- Add database versioning for future upgrades
- Implement analytics on session usage and performance
- Add authentication for multi-user support 