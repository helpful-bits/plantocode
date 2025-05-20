import {
  showMessage,
  showConfirmation,
  showOkCancel,
  selectFile,
  selectDirectory,
  selectMultipleFiles,
  saveFile,
  showError,
  showWarning,
} from "../../../utils/dialog-utils";

import type React from "react";


interface ButtonProps {
  onClick: () => Promise<void>;
  label: string;
}

const DialogButton: React.FC<ButtonProps> = ({ onClick, label }) => {
  const handleClick = async () => {
    try {
      await onClick();
    } catch (_error) {
      // Error handling
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
    await showMessage("This is a simple message dialog.", "Information");
  };

  const handleShowConfirmation = async () => {
    await showConfirmation(
      "Are you sure you want to proceed?",
      "Confirmation"
    );
  };

  const handleShowOkCancel = async () => {
    await showOkCancel(
      "Do you want to continue with this operation?",
      "Confirm"
    );
  };

  const handleSelectFile = async () => {
    await selectFile({
      title: "Select a file",
      filters: [
        {
          name: "Text Files",
          extensions: ["txt", "md"],
        },
      ],
    });
  };

  const handleSelectDirectory = async () => {
    await selectDirectory({
      title: "Select a directory",
    });
  };

  const handleSelectMultipleFiles = async () => {
    await selectMultipleFiles({
      title: "Select multiple files",
      filters: [
        {
          name: "Images",
          extensions: ["jpg", "png", "gif"],
        },
      ],
    });
  };

  const handleSaveFile = async () => {
    await saveFile({
      title: "Save file",
      filters: [
        {
          name: "Text Files",
          extensions: ["txt"],
        },
      ],
    });
  };

  const handleShowError = async () => {
    await showError(
      "Error",
      "An error occurred while processing your request. Please try again."
    );
  };

  const handleShowWarning = async () => {
    await showWarning(
      "Warning",
      "This action might have unexpected consequences."
    );
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Tauri Dialog Examples</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DialogButton onClick={handleShowMessage} label="Show Message" />
        <DialogButton
          onClick={handleShowConfirmation}
          label="Show Confirmation"
        />
        <DialogButton onClick={handleShowOkCancel} label="Show OK/Cancel" />
        <DialogButton onClick={handleSelectFile} label="Select File" />
        <DialogButton
          onClick={handleSelectDirectory}
          label="Select Directory"
        />
        <DialogButton
          onClick={handleSelectMultipleFiles}
          label="Select Multiple Files"
        />
        <DialogButton onClick={handleSaveFile} label="Save File" />
        <DialogButton onClick={handleShowError} label="Show Error" />
        <DialogButton onClick={handleShowWarning} label="Show Warning" />
      </div>

      <div className="mt-6 p-4 bg-gray-100 rounded">
        <p>Dialog examples for Tauri</p>
      </div>
    </div>
  );
};
