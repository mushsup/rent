# Configure Supabase CLI migration management for beta

## Checklist

- [ ] Install the Supabase CLI as a project development dependency.
- [ ] Initialize the standard `supabase/` project directory.
- [ ] Add safe scripts and documentation for linking and pushing beta migrations.
- [ ] Link the beta project and pull its manually-created schema as a baseline.
- [ ] Verify the migration history and remote schema workflow.

## Scope

The beta project is the only remote target. Production remains unlinked and untouched. Authentication and database passwords are entered by the user through the Supabase CLI and are never stored in the repository.
