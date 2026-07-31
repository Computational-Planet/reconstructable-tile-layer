/** Owns feature and rotation source controls, including uploaded object URLs. */
import { useEffect, useRef, useState } from "react";

import {
  DEFAULT_FEATURE_PRESET,
  DEFAULT_ROTATION_PRESET,
  FEATURE_PRESETS,
  ROTATION_PRESETS,
  type FeaturePresetKey,
  type RotationPresetKey,
} from "../dataSources";
import { revokeObjectUrl, revokeObjectUrls } from "../utils/files";

export function parseRotationUrls(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function formatRotationUrls(urls: string[]) {
  return urls.join("\n");
}

function hasSameItems(left: string[], right: string[]) {
  return (
    left.length === right.length && left.every((item, index) => item === right[index])
  );
}

type UseDataSourceControlsOptions = {
  onModelNameChange: (value: string) => void;
  onStatusChange: (value: string) => void;
};

export function useDataSourceControls({
  onModelNameChange,
  onStatusChange,
}: UseDataSourceControlsOptions) {
  const uploadedFeatureUrlRef = useRef<string | null>(null);
  const uploadedRotUrlsRef = useRef<string[]>([]);
  const [featurePresetKey, setFeaturePresetKey] = useState<FeaturePresetKey>(
    DEFAULT_FEATURE_PRESET.key,
  );
  const [featureSourceLabel, setFeatureSourceLabel] = useState("");
  const [featureUrl, setFeatureUrl] = useState(DEFAULT_FEATURE_PRESET.url);
  const [rotPresetKey, setRotPresetKey] = useState<RotationPresetKey>(
    DEFAULT_ROTATION_PRESET.key,
  );
  const [rotSourceLabels, setRotSourceLabels] = useState<string[]>([]);
  const [rotUrls, setRotUrls] = useState(
    formatRotationUrls(DEFAULT_ROTATION_PRESET.urls),
  );

  const revokeUploadedFeatureUrl = () => {
    revokeObjectUrl(uploadedFeatureUrlRef.current);
    uploadedFeatureUrlRef.current = null;
  };

  const revokeUploadedRotUrls = () => {
    revokeObjectUrls(uploadedRotUrlsRef.current);
    uploadedRotUrlsRef.current = [];
  };

  useEffect(() => {
    return () => {
      revokeUploadedFeatureUrl();
      revokeUploadedRotUrls();
    };
  }, []);

  const handleFeaturePresetChange = (key: FeaturePresetKey) => {
    setFeaturePresetKey(key);
    if (key === "custom") {
      return;
    }

    const preset = FEATURE_PRESETS.find((item) => item.key === key);
    if (preset) {
      revokeUploadedFeatureUrl();
      setFeatureSourceLabel("");
      setFeatureUrl(preset.url);
      onModelNameChange(preset.label);
    }
  };

  const handleFeatureUpload = (file: File | null) => {
    if (!file) {
      return;
    }

    revokeUploadedFeatureUrl();
    const url = URL.createObjectURL(file);
    uploadedFeatureUrlRef.current = url;
    setFeaturePresetKey("custom");
    setFeatureSourceLabel(file.name);
    setFeatureUrl(url);
    onModelNameChange(file.name);
    onStatusChange(`Feature upload selected: ${file.name}`);
  };

  const handleFeatureUrlChange = (value: string) => {
    revokeUploadedFeatureUrl();
    setFeaturePresetKey("custom");
    setFeatureSourceLabel("");
    setFeatureUrl(value);
  };

  const handleRotPresetChange = (key: RotationPresetKey) => {
    setRotPresetKey(key);
    if (key === "custom") {
      return;
    }

    const preset = ROTATION_PRESETS.find((item) => item.key === key);
    if (preset) {
      revokeUploadedRotUrls();
      setRotSourceLabels([]);
      setRotUrls(formatRotationUrls(preset.urls));
    }
  };

  const handleRotUpload = (files: FileList | null) => {
    const selectedFiles = Array.from(files ?? []);
    if (selectedFiles.length === 0) {
      return;
    }

    revokeUploadedRotUrls();
    const urls = selectedFiles.map((file) => URL.createObjectURL(file));
    uploadedRotUrlsRef.current = urls;
    setRotPresetKey("custom");
    setRotSourceLabels(selectedFiles.map((file) => file.name));
    setRotUrls(formatRotationUrls(urls));
    onStatusChange(
      `ROT uploads selected: ${selectedFiles
        .map((file) => file.name)
        .join(", ")}`,
    );
  };

  const handleRotUrlsChange = (value: string) => {
    revokeUploadedRotUrls();
    setRotPresetKey("custom");
    setRotSourceLabels([]);
    setRotUrls(value);
  };

  const applyImportedFeatureSource = (
    importedFeatureUrl: string | undefined,
    importedFeaturePresetKey: FeaturePresetKey | undefined,
  ) => {
    if (importedFeatureUrl) {
      const matchedFeaturePreset = FEATURE_PRESETS.find(
        (preset) => preset.url === importedFeatureUrl,
      );
      revokeUploadedFeatureUrl();
      setFeatureSourceLabel("");
      setFeatureUrl(importedFeatureUrl);
      setFeaturePresetKey(
        importedFeaturePresetKey ?? matchedFeaturePreset?.key ?? "custom",
      );
    } else if (importedFeaturePresetKey) {
      setFeaturePresetKey(importedFeaturePresetKey);
    }
  };

  const applyImportedRotationSources = (
    importedRotUrls: string[] | undefined,
    importedRotPresetKey: RotationPresetKey | undefined,
  ) => {
    if (importedRotUrls) {
      const matchedRotationPreset = ROTATION_PRESETS.find((preset) =>
        hasSameItems(preset.urls, importedRotUrls),
      );
      revokeUploadedRotUrls();
      setRotSourceLabels([]);
      setRotUrls(formatRotationUrls(importedRotUrls));
      setRotPresetKey(
        importedRotPresetKey ?? matchedRotationPreset?.key ?? "custom",
      );
    } else if (importedRotPresetKey) {
      setRotPresetKey(importedRotPresetKey);
    }
  };

  return {
    applyImportedFeatureSource,
    applyImportedRotationSources,
    featurePresetKey,
    featureSourceLabel,
    featureUrl,
    handleFeaturePresetChange,
    handleFeatureUpload,
    handleFeatureUrlChange,
    handleRotPresetChange,
    handleRotUpload,
    handleRotUrlsChange,
    rotationSources: parseRotationUrls(rotUrls),
    rotPresetKey,
    rotSourceLabels,
    rotUrls,
  };
}
