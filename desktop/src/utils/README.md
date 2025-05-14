# Tauri Dialog Utilities

This module provides utility functions for working with the Tauri dialog plugin (`@tauri-apps/plugin-dialog`), making it easier to display native dialogs in the desktop application.

## Installation

The dialog plugin should already be installed as a dependency in the project. If not, you can install it with:

```bash
npm install @tauri-apps/plugin-dialog
# or
pnpm add @tauri-apps/plugin-dialog
# or
yarn add @tauri-apps/plugin-dialog
```

## Available Functions

### Message Dialogs

- `showMessage(content, title?, options?)`: Shows a simple message dialog with an "Ok" button
- `showConfirmation(content, title?, options?)`: Shows a dialog with "Yes" and "No" buttons
- `showOkCancel(content, title?, options?)`: Shows a dialog with "Ok" and "Cancel" buttons
- `showError(title, content)`: Shows an error message dialog
- `showWarning(title, content)`: Shows a warning message dialog

### File Dialogs

- `selectFile(options?)`: Opens a file selection dialog
- `selectDirectory(options?)`: Opens a directory selection dialog
- `selectMultipleFiles(options?)`: Opens a dialog for selecting multiple files
- `saveFile(options?)`: Opens a save file dialog

## Examples

### Message Dialog

```typescript
import { showMessage } from '../utils/dialog-utils';

// Show a simple message
await showMessage('This is a message', 'Dialog Title');

// Show a warning message
await showWarning('Warning', 'This is a warning message');

// Show an error message
await showError('Error', 'An error occurred');
```

### Confirmation Dialog

```typescript
import { showConfirmation } from '../utils/dialog-utils';

// Ask for confirmation
const confirmed = await showConfirmation(
  'Are you sure you want to proceed?', 
  'Confirmation'
);

if (confirmed) {
  // User clicked "Yes"
  console.log('User confirmed the action');
} else {
  // User clicked "No" or closed the dialog
  console.log('User declined the action');
}
```

### File Selection

```typescript
import { selectFile, selectDirectory, selectMultipleFiles } from '../utils/dialog-utils';

// Select a single file
const filePath = await selectFile({
  title: 'Select a file',
  filters: [{
    name: 'Text Files',
    extensions: ['txt', 'md']
  }]
});

// Select a directory
const directoryPath = await selectDirectory({
  title: 'Select a directory'
});

// Select multiple files
const filePaths = await selectMultipleFiles({
  title: 'Select multiple files',
  filters: [{
    name: 'Images',
    extensions: ['jpg', 'png', 'gif']
  }]
});
```

### File Save Dialog

```typescript
import { saveFile } from '../utils/dialog-utils';

// Open a save file dialog
const savePath = await saveFile({
  title: 'Save file',
  filters: [{
    name: 'Text Files',
    extensions: ['txt']
  }]
});

if (savePath) {
  // User selected a save location
  // You can now write to this file
  console.log('File will be saved to:', savePath);
} else {
  // User canceled the save dialog
  console.log('Save operation canceled');
}
```

## Notes

- All dialog functions return Promises that resolve when the dialog is closed
- File and directory paths are automatically added to the filesystem scope, so you can access them without additional permissions
- The scope change is not persisted across app restarts. For persistence, you should use `tauri-plugin-persisted-scope`
- Dialog functions may throw exceptions if there are issues with the underlying Tauri API