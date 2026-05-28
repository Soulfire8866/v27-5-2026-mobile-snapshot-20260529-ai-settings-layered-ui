# Snapshot 2026-05-28: Export file manager + VFS layout refresh

## Scope

This snapshot captures the current backup/export architecture and UI flow after:

- Native Android chunk-based file save integration across export points.
- Exported file registry (URI tracking) for safer post-export management.
- New exported file actions:
  - delete physical file via native URI
  - remove from in-app list without touching physical file
- VFS Manager layout refactor:
  - backup/restore actions remain primary on default screen
  - "Xem & Sửa Từng File" moved to a dedicated sub-screen with Back navigation

## Key files (high impact)

- `src/components/VFSManager.tsx`
- `src/utils/nativeFileSave.ts`
- `src/utils/exportedFilesRegistry.ts`
- `src/plugins/nativeFileSave.ts`
- `android/app/src/main/java/com/nguyenthaidung/noveltranslator/NativeFileSavePlugin.java`
- `src/lib/persistence.ts`

## User-facing outcomes

- Backup/restore screen is less cramped and easier to use.
- Advanced file editor is still available but no longer blocks primary flows.
- Exported files can now be managed more safely inside the app.

## Validation notes

- Type check passed via `npm run lint` (`tsc --noEmit`).
- QA script still depends on a runtime with IndexedDB support when executed under Node.
