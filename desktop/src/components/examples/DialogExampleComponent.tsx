import React from 'react';
import {
  showMessage,
  showConfirmation,
  showOkCancel,
  selectFile,
  selectDirectory,
  selectMultipleFiles,
  saveFile,
  showError,
  showWarning
} from '../../utils/dialog-utils';

interface ButtonProps {
  onClick: () => Promise<void>;
  label: string;
}

const DialogButton: React.FC<ButtonProps> = ({ onClick, label }) => {
  const handleClick = async () => {
    try {
      await onClick();
    } catch (error) {
      console.error(`Error in ${label}:`, error);
    }
  };

  return (
    <button
      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
      onClick={handleClick}
    >
      {label}
    </button>
  );
};

export const DialogExampleComponent: React.FC = () => {
  const handleShowMessage = async () => {
    await showMessage('This is a simple message dialog.', 'Information');
  };

  const handleShowConfirmation = async () => {
    const result = await showConfirmation(
      'Are you sure you want to proceed?',
      'Confirmation'
    );
    console.log('Confirmation result:', result);
  };

  const handleShowOkCancel = async () => {
    const result = await showOkCancel(
      'Do you want to continue with this operation?',
      'Confirm'
    );
    console.log('OK/Cancel result:', result);
  };

  const handleSelectFile = async () => {
    const filePath = await selectFile({
      title: 'Select a file',
      filters: [{
        name: 'Text Files',
        extensions: ['txt', 'md']
      }]
    });
    console.log('Selected file:', filePath);
  };

  const handleSelectDirectory = async () => {
    const directoryPath = await selectDirectory({
      title: 'Select a directory'
    });
    console.log('Selected directory:', directoryPath);
  };

  const handleSelectMultipleFiles = async () => {
    const filePaths = await selectMultipleFiles({
      title: 'Select multiple files',
      filters: [{
        name: 'Images',
        extensions: ['jpg', 'png', 'gif']
      }]
    });
    console.log('Selected files:', filePaths);
  };

  const handleSaveFile = async () => {
    const savePath = await saveFile({
      title: 'Save file',
      filters: [{
        name: 'Text Files',
        extensions: ['txt']
      }]
    });
    console.log('Save path:', savePath);
  };

  const handleShowError = async () => {
    await showError(
      'Error',
      'An error occurred while processing your request. Please try again.'
    );
  };

  const handleShowWarning = async () => {
    await showWarning(
      'Warning',
      'This action might have unexpected consequences.'
    );
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Tauri Dialog Examples</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DialogButton onClick={handleShowMessage} label="Show Message" />
        <DialogButton onClick={handleShowConfirmation} label="Show Confirmation" />
        <DialogButton onClick={handleShowOkCancel} label="Show OK/Cancel" />
        <DialogButton onClick={handleSelectFile} label="Select File" />
        <DialogButton onClick={handleSelectDirectory} label="Select Directory" />
        <DialogButton onClick={handleSelectMultipleFiles} label="Select Multiple Files" />
        <DialogButton onClick={handleSaveFile} label="Save File" />
        <DialogButton onClick={handleShowError} label="Show Error" />
        <DialogButton onClick={handleShowWarning} label="Show Warning" />
      </div>
      
      <div className="mt-6 p-4 bg-gray-100 rounded">
        <p>Check the console for dialog results</p>
      </div>
    </div>
  );
};