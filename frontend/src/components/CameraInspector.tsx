import React, { useRef, useEffect, useState, useCallback } from 'react';
import { InspectionResponse } from '../types';
import { InspectionResult } from './InspectionResult';

interface CameraInspectorProps {
  apiUrl: string;
  onInspectionResult: (result: InspectionResponse | null) => void;
  userId: string;
  wardId: string;
  externalResult?: InspectionResponse | null;
  onFrameCaptureReady?: (getFrameFn: () => string | null) => void;
}

export const CameraInspector: React.FC<CameraInspectorProps> = ({
  apiUrl,
  onInspectionResult,
  userId,
  wardId,
  externalResult,
  onFrameCaptureReady,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isStreaming, setIsStreaming] = useState(false);
  const [targetBin, setTargetBin] = useState('Auto-Detect');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<InspectionResponse | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<'phone' | 'bottle' | 'pizza' | 'empty' | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isCameraOn, setIsCameraOn] = useState(true);
  const streamRef = useRef<MediaStream | null>(null);

  // Real-time Automatic Presence Detection State & References
  const [isObjectDetectedLive, setIsObjectDetectedLive] = useState(false);
  const detectorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastObjectDetectedRef = useRef(false);
  const detectionStreakRef = useRef(0);
  const lastAutoAuditTimeRef = useRef(0);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  // Stop Webcam stream cleanly releasing hardware media tracks
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  }, []);

  // Initialize Webcam at High Resolution (at least 640x480, ideal 1280x720)
  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          facingMode: 'environment',
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
        setIsStreaming(true);
        setCameraError(null);
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError(
        'Webcam unavailable or permission denied. You can test manually using Upload Photo or Sample Presets below.'
      );
      setIsStreaming(false);
    }
  }, []);

  // Toggle Camera On/Off
  const toggleCamera = useCallback(() => {
    setIsCameraOn((prev) => {
      const next = !prev;
      if (next) {
        startCamera();
      } else {
        stopCamera();
      }
      return next;
    });
  }, [startCamera, stopCamera]);

  useEffect(() => {
    if (isCameraOn) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isCameraOn, startCamera, stopCamera]);

  // Update overlay canvas size when video dimensions are known
  const handleVideoMetadataLoaded = () => {
    if (videoRef.current && overlayCanvasRef.current) {
      overlayCanvasRef.current.width = videoRef.current.videoWidth || 640;
      overlayCanvasRef.current.height = videoRef.current.videoHeight || 480;
    }
  };

  // 2. Draw Green / Red Bounding Box on Overlay Canvas
  // 2. Draw Green / Red Bounding Box on Overlay Canvas with Dynamic Detection
  const drawOverlay = useCallback((result: InspectionResponse | null) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Immediately clear overlay
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!result) return;

    // If No Object is detected, overlays must automatically disappear
    const isNoObject =
      !result.item_detected ||
      result.item_detected === 'None' ||
      result.correct_bin === 'Waiting for Item...' ||
      result.category === 'N/A';

    if (isNoObject) {
      return;
    }

    const { ymin, xmin, ymax, xmax } = result.bounding_box || { ymin: 0, xmin: 0, ymax: 0, xmax: 0 };
    if (ymin === 0 && xmin === 0 && ymax === 0 && xmax === 0) {
      return;
    }

    const x = (xmin / 1000) * canvas.width;
    const y = (ymin / 1000) * canvas.height;
    const width = ((xmax - xmin) / 1000) * canvas.width;
    const height = ((ymax - ymin) / 1000) * canvas.height;

    const isGreen = result.box_color === 'green';
    const strokeColor = isGreen ? '#10b981' : '#f43f5e';
    const fillColor = isGreen ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)';

    // Ambient glow
    ctx.save();
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur = 18;

    // Bounding Box
    ctx.lineWidth = 3;
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(x, y, width, height, 8);
    } else {
      ctx.rect(x, y, width, height);
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Corner Reticle Brackets (High-Tech HUD styling)
    const cornerSize = Math.max(12, Math.min(24, width * 0.15, height * 0.15));
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(x, y + cornerSize);
    ctx.lineTo(x, y);
    ctx.lineTo(x + cornerSize, y);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(x + width - cornerSize, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + cornerSize);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(x, y + height - cornerSize);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x + cornerSize, y + height);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(x + width - cornerSize, y + height);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x + width, y + height - cornerSize);
    ctx.stroke();

    // Target Label Badge Header
    const labelText = `${result.item_detected} • ${isGreen ? 'CLEAN (PASS)' : 'CONTAMINATED / HAZARD'}`;
    const fontSize = Math.max(12, Math.round(canvas.width * 0.022));
    ctx.font = `bold ${fontSize}px sans-serif`;
    const textWidth = ctx.measureText(labelText).width;
    const badgeHeight = fontSize + 12;

    ctx.fillStyle = strokeColor;
    ctx.fillRect(x, Math.max(0, y - badgeHeight - 4), textWidth + 18, badgeHeight);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(labelText, x + 9, Math.max(fontSize + 2, y - 8));
  }, []);

  // Synchronize external inspection results (e.g. from ShieldBin AI Copilot)
  useEffect(() => {
    if (externalResult) {
      setLastResult(externalResult);
      drawOverlay(externalResult);
    }
  }, [externalResult, drawOverlay]);

  // Frame capture function exposed to external components like AiChatBox
  const getCurrentFrame = useCallback((): string | null => {
    if (previewImage) {
      return previewImage;
    }
    if (!isCameraOn) {
      return null;
    }
    if (videoRef.current && canvasRef.current && videoRef.current.videoWidth > 0) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const captureWidth = Math.max(video.videoWidth || 640, 640);
      const captureHeight = Math.max(video.videoHeight || 480, 480);
      canvas.width = captureWidth;
      canvas.height = captureHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(video, 0, 0, captureWidth, captureHeight);
        return canvas.toDataURL('image/jpeg', 0.90);
      }
    }
    return null;
  }, [previewImage, isCameraOn]);

  useEffect(() => {
    if (onFrameCaptureReady) {
      onFrameCaptureReady(getCurrentFrame);
    }
  }, [onFrameCaptureReady, getCurrentFrame]);

  // 3. Strict Manual Inspection API Call (Executed ONLY when clicking "Inspect Waste Item" or a Sample Preset)
  const inspectImageBase64 = useCallback(
    async (imageBase64: string, customBin?: string, presetKey?: string | null) => {
      if (isProcessing) return;
      setIsProcessing(true);

      const binToUse = customBin || targetBin;
      const activePreset = presetKey !== undefined ? presetKey : selectedPreset;
      const locationContext = activePreset
        ? `India - Municipal [preset:${activePreset}]`
        : 'India - Municipal';

      try {
        const res = await fetch(`${apiUrl}/api/inspect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_base64: imageBase64,
            target_bin: binToUse,
            user_id: userId,
            ward_id: wardId,
            location_context: locationContext,
          }),
        });

        if (res.ok) {
          const data: InspectionResponse = await res.json();
          setLastResult(data);
          onInspectionResult(data);
          drawOverlay(data);
        } else {
          console.error('Inspection API returned status:', res.status);
        }
      } catch (err) {
        console.error('Failed to inspect frame:', err);
      } finally {
        setIsProcessing(false);
      }
    },
    [apiUrl, targetBin, userId, wardId, isProcessing, selectedPreset, onInspectionResult, drawOverlay]
  );

  // 4. Clean State Reset: When clicking "Scan Another Item" or live feed reset
  // Completely clear the previous result banner and show the live camera feed ready for the next snapshot
  const handleReset = useCallback(() => {
    setLastResult(null);
    setPreviewImage(null);
    setSelectedPreset(null);
    lastObjectDetectedRef.current = false;
    detectionStreakRef.current = 0;
    setIsObjectDetectedLive(false);
    onInspectionResult(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    const canvas = overlayCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    if (isCameraOn && videoRef.current && videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    }
  }, [isCameraOn, onInspectionResult]);

  // 5. Draw High-Tech Targeting Reticle when an Object is First Detected in View
  const drawTargetingReticle = useCallback((isLocked: boolean, label?: string) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const w = canvas.width;
    const h = canvas.height;

    // Centered detection box: 54% width, 58% height
    const boxW = Math.round(w * 0.54);
    const boxH = Math.round(h * 0.58);
    const x = Math.round((w - boxW) / 2);
    const y = Math.round((h - boxH) / 2);

    const strokeColor = isLocked ? '#10b981' : '#06b6d4';
    const fillColor = isLocked ? 'rgba(16, 185, 129, 0.08)' : 'rgba(6, 182, 212, 0.08)';

    // Ambient glow
    ctx.save();
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur = 18;

    // Outer bounding box
    ctx.lineWidth = 3;
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(x, y, boxW, boxH, 8);
    } else {
      ctx.rect(x, y, boxW, boxH);
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // High-tech corner HUD brackets
    const cornerSize = Math.max(16, Math.min(28, boxW * 0.12));
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(x, y + cornerSize);
    ctx.lineTo(x, y);
    ctx.lineTo(x + cornerSize, y);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(x + boxW - cornerSize, y);
    ctx.lineTo(x + boxW, y);
    ctx.lineTo(x + boxW, y + cornerSize);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(x, y + boxH - cornerSize);
    ctx.lineTo(x, y + boxH);
    ctx.lineTo(x + cornerSize, y + boxH);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(x + boxW - cornerSize, y + boxH);
    ctx.lineTo(x + boxW, y + boxH);
    ctx.lineTo(x + boxW, y + boxH - cornerSize);
    ctx.stroke();

    // Center Crosshairs
    const cx = x + boxW / 2;
    const cy = y + boxH / 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy);
    ctx.lineTo(cx + 16, cy);
    ctx.moveTo(cx, cy - 16);
    ctx.lineTo(cx, cy + 16);
    ctx.stroke();

    // Badge label
    const badgeText = label || (isLocked ? '⚡ OBJECT DETECTED • AUDITING' : '🎯 DETECTING OBJECT...');
    const fontSize = Math.max(12, Math.round(w * 0.022));
    ctx.font = `bold ${fontSize}px sans-serif`;
    const textWidth = ctx.measureText(badgeText).width;
    const badgeHeight = fontSize + 12;

    ctx.fillStyle = strokeColor;
    ctx.fillRect(x, Math.max(0, y - badgeHeight - 4), textWidth + 18, badgeHeight);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(badgeText, x + 9, Math.max(fontSize + 2, y - 8));
  }, []);

  // 6. Client-side Computer Vision Presence Detection (analyzes center ROI variance vs peripheral corners)
  const checkLiveFrameForObject = useCallback((): boolean => {
    if (!videoRef.current || !isStreaming || !isCameraOn || previewImage) {
      return false;
    }
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0 || video.paused || video.ended) {
      return false;
    }

    if (!detectorCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = 160;
      c.height = 120;
      detectorCanvasRef.current = c;
    }
    const canvas = detectorCanvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;

    try {
      ctx.drawImage(video, 0, 0, 160, 120);
      const imgData = ctx.getImageData(0, 0, 160, 120);
      const data = imgData.data;

      // 1. Center ROI (x: 40 to 120, y: 30 to 90) -> 50% width x 50% height
      let centerLumaSum = 0;
      let centerLumaSqSum = 0;
      let centerEdgeEnergy = 0;
      let centerCount = 0;

      for (let y = 30; y < 90; y += 2) {
        for (let x = 40; x < 120; x += 2) {
          const idx = (y * 160 + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          centerLumaSum += luma;
          centerLumaSqSum += luma * luma;

          // Horizontal gradient with adjacent pixel
          const rIdx = (y * 160 + (x + 1)) * 4;
          const rLuma = 0.299 * data[rIdx] + 0.587 * data[rIdx + 1] + 0.114 * data[rIdx + 2];
          // Vertical gradient with adjacent pixel
          const bIdx = ((y + 1) * 160 + x) * 4;
          const bLuma = 0.299 * data[bIdx] + 0.587 * data[bIdx + 1] + 0.114 * data[bIdx + 2];
          centerEdgeEnergy += Math.abs(luma - rLuma) + Math.abs(luma - bLuma);

          centerCount++;
        }
      }

      if (centerCount === 0) return false;

      const centerMean = centerLumaSum / centerCount;
      const centerVar = (centerLumaSqSum / centerCount) - (centerMean * centerMean);
      const avgEdge = centerEdgeEnergy / centerCount;

      // Outlier conditions: lens covered (pitch black) or bleached bright light
      if (centerMean < 12) return false;
      if (centerMean > 245 && centerVar < 25) return false;

      // 2. Peripheral Corner Background (sample 4 corners to establish ambient background)
      let periLumaSum = 0;
      let periCount = 0;
      const corners = [
        { x1: 6, x2: 30, y1: 6, y2: 24 },
        { x1: 130, x2: 154, y1: 6, y2: 24 },
        { x1: 6, x2: 30, y1: 96, y2: 114 },
        { x1: 130, x2: 154, y1: 96, y2: 114 },
      ];
      for (const c of corners) {
        for (let y = c.y1; y < c.y2; y += 2) {
          for (let x = c.x1; x < c.x2; x += 2) {
            const idx = (y * 160 + x) * 4;
            const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            periLumaSum += luma;
            periCount++;
          }
        }
      }
      const periMean = periLumaSum / (periCount || 1);
      const contrastDiff = Math.abs(centerMean - periMean);

      // Presence criteria:
      // Object present if center variance, edge boundaries, or contrast against perimeter background is high
      const isPresent = centerVar > 95 || avgEdge > 5.8 || (contrastDiff > 16 && centerVar > 55);
      return isPresent;
    } catch {
      return false;
    }
  }, [isStreaming, isCameraOn, previewImage]);

  // 5. High-Resolution Canvas Capture & Manual Trigger
  const captureAndInspect = useCallback(async () => {
    if (isProcessing) return;

    // If an image was uploaded or chosen via preset, inspect that frame
    if (previewImage) {
      inspectImageBase64(previewImage, undefined, selectedPreset);
      return;
    }

    if (!isCameraOn) {
      alert('Camera is currently turned off. Please turn on the camera or upload an image to inspect.');
      return;
    }

    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    // High-Resolution Capture: use actual video dimensions (at least 640x480)
    const captureWidth = Math.max(video.videoWidth || 640, 640);
    const captureHeight = Math.max(video.videoHeight || 480, 480);

    canvas.width = captureWidth;
    canvas.height = captureHeight;

    // Synchronize overlay canvas dimensions as well
    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.width = captureWidth;
      overlayCanvasRef.current.height = captureHeight;
    }

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(video, 0, 0, captureWidth, captureHeight);

      // High-resolution JPEG (quality 0.90) so Bedrock receives sharp visual markers
      const imageBase64 = canvas.toDataURL('image/jpeg', 0.90);
      inspectImageBase64(imageBase64, undefined, null);
    }
  }, [previewImage, isProcessing, selectedPreset, inspectImageBase64]);

  // 7. Real-Time Automatic Object Detection & Dynamic Frame Rendering Loop
  // Automatically detects object in front of camera:
  // - Frame automatically appears when an object is placed in front of camera
  // - Frame automatically disappears when there is no object in front of camera
  useEffect(() => {
    if (!isCameraOn || !isStreaming || previewImage) {
      return;
    }

    const intervalId = setInterval(() => {
      const isPresent = checkLiveFrameForObject();

      if (isPresent) {
        detectionStreakRef.current = Math.min(3, detectionStreakRef.current + 1);
      } else {
        detectionStreakRef.current = Math.max(0, detectionStreakRef.current - 1);
      }

      const objectConfirmed = detectionStreakRef.current >= 2;

      if (!objectConfirmed) {
        // NO OBJECT IN FRONT OF CAMERA -> FRAME MUST DISAPPEAR IMMEDIATELY!
        if (lastObjectDetectedRef.current) {
          lastObjectDetectedRef.current = false;
          setIsObjectDetectedLive(false);

          // Clear overlay canvas immediately so frame disappears
          const canvas = overlayCanvasRef.current;
          if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
          }

          // Clear result and notify parent to revert accuracy and contamination to 0
          setLastResult(null);
          onInspectionResult(null);
        }
      } else {
        // OBJECT IS PRESENT IN FRONT OF CAMERA -> FRAME MUST APPEAR AUTOMATICALLY!
        const justEntered = !lastObjectDetectedRef.current;
        lastObjectDetectedRef.current = true;
        setIsObjectDetectedLive(true);

        // If an audited classification already exists for this item, display full bounding box
        if (lastResult && lastResult.item_detected && lastResult.item_detected !== 'None' && lastResult.correct_bin !== 'Waiting for Item...') {
          drawOverlay(lastResult);
        } else {
          // Object entered or waiting for classification: show high-tech auto-detection HUD frame
          drawTargetingReticle(true, '⚡ OBJECT DETECTED • AUDITING BIN...');
        }

        const now = Date.now();
        // Automatically trigger AI inspection when object enters or every 2.5s while present
        if ((justEntered || now - lastAutoAuditTimeRef.current > 2500) && !isProcessingRef.current) {
          lastAutoAuditTimeRef.current = now;
          captureAndInspect();
        }
      }
    }, 380);

    return () => {
      clearInterval(intervalId);
    };
  }, [
    isCameraOn,
    isStreaming,
    previewImage,
    checkLiveFrameForObject,
    drawOverlay,
    drawTargetingReticle,
    captureAndInspect,
    lastResult,
    onInspectionResult,
  ]);

  // Handle local image file upload (loads image frame for manual inspection)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setPreviewImage(b64);
      setSelectedPreset(null);
      setLastResult(null); // Clear previous result banner
      const canvas = overlayCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Sample test frame generator for instant verification of Phone, Bottle, Pizza, or Empty
  const handleSamplePreset = (preset: 'phone' | 'bottle' | 'pizza' | 'empty') => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, 1280, 720);

    if (preset === 'phone') {
      // Draw realistic Mobile Phone silhouette for E-Waste test
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 6;
      ctx.fillRect(490, 110, 300, 500);
      ctx.strokeRect(490, 110, 300, 500);
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(510, 150, 260, 410);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('📱 MOBILE PHONE', 640, 340);
      ctx.font = '18px sans-serif';
      ctx.fillText('E-Waste / Lithium Battery Device', 640, 380);
    } else if (preset === 'bottle') {
      ctx.fillStyle = '#064e3b';
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 6;
      ctx.fillRect(520, 120, 240, 480);
      ctx.strokeRect(520, 120, 240, 480);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🧴 CLEAN PET BOTTLE', 640, 350);
      ctx.font = '18px sans-serif';
      ctx.fillText('Dry Recyclable Plastic (#1 PET)', 640, 390);
    } else if (preset === 'pizza') {
      ctx.fillStyle = '#78350f';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 6;
      ctx.fillRect(380, 160, 520, 400);
      ctx.strokeRect(380, 160, 520, 400);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🍕 GREASY PIZZA BOX', 640, 350);
      ctx.font = '18px sans-serif';
      ctx.fillText('Oil-Stained Cardboard (Contaminated)', 640, 390);
    } else {
      ctx.fillStyle = '#334155';
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Empty Background (No Waste Item Present)', 640, 360);
    }

    const b64 = canvas.toDataURL('image/jpeg', 0.90);
    setPreviewImage(b64);
    setSelectedPreset(preset);
    setLastResult(null);
    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.width = 1280;
      overlayCanvasRef.current.height = 720;
      const octx = overlayCanvasRef.current.getContext('2d');
      octx?.clearRect(0, 0, 1280, 720);
    }
    // Immediately inspect the selected sample preset so clicking a sample test button returns its result right away
    inspectImageBase64(b64, undefined, preset);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Hidden File Input for Image Upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*"
        className="hidden"
      />

      {/* Viewport Frame */}
      <div className="relative rounded-2xl overflow-hidden bg-[#070A0F] border border-slate-800/80 shadow-2xl shadow-black/60 aspect-[4/3] max-w-2xl mx-auto w-full transition-all group">
        {previewImage ? (
          <img
            src={previewImage}
            alt="Inspection Frame"
            className="w-full h-full object-contain bg-[#070A0F]"
          />
        ) : !isCameraOn ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-[#070A0F] text-slate-300 p-6 text-center select-none">
            <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-3xl mb-3 shadow-inner">
              📷
            </div>
            <h4 className="text-sm sm:text-base font-bold text-white mb-1">Camera is Turned Off</h4>
            <p className="text-xs text-slate-400 max-w-sm mb-4 leading-relaxed">
              Webcam feed is paused and hardware camera is disengaged. Turn the camera back on or upload a photo to inspect waste.
            </p>
            <button
              onClick={toggleCamera}
              className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/20 transition-all cursor-pointer flex items-center gap-2 hover:-translate-y-0.5 active:scale-95"
            >
              <span>🎥</span>
              <span>Turn On Camera</span>
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            onLoadedMetadata={handleVideoMetadataLoaded}
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        )}

        {/* Bounding Box Overlay Canvas */}
        <canvas
          ref={overlayCanvasRef}
          width={640}
          height={480}
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
        />

        {/* Hidden high-res capture canvas */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Status Bar Overlay */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-20 pointer-events-none gap-2">
          <div className="flex items-center gap-2 bg-[#0B0F17]/85 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-slate-800/80 text-xs text-white shadow-lg">
            <span
              className={`w-2 h-2 rounded-full ${
                isProcessing
                  ? 'bg-amber-400 animate-ping'
                  : previewImage
                  ? 'bg-cyan-400'
                  : !isCameraOn
                  ? 'bg-slate-400'
                  : isObjectDetectedLive
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-emerald-500/40 ring-1 ring-emerald-500/30'
              }`}
            />
            <span className="font-mono text-[11px] sm:text-xs">
              {isProcessing
                ? 'Auditing with Bedrock...'
                : previewImage
                ? 'Frame Loaded • Ready'
                : !isCameraOn
                ? 'Camera Off • Standby'
                : isObjectDetectedLive
                ? '⚡ Object Detected • Frame Active'
                : 'Live Camera • Auto-Detecting (No Object)'}
            </span>
          </div>

          <div className="bg-[#0B0F17]/85 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-slate-800/80 text-xs text-slate-300 font-mono shadow-lg">
            Target: <strong className="text-emerald-400 font-bold">{targetBin}</strong>
          </div>
        </div>

        {/* Error Notification if camera unavailable and no preview */}
        {cameraError && !previewImage && isCameraOn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#070A0F]/95 text-slate-200 p-6 text-center z-30">
            <span className="text-4xl mb-2">📷</span>
            <p className="font-semibold text-rose-300 mb-2 text-sm">{cameraError}</p>
            <p className="text-xs text-slate-400 mb-4 max-w-md leading-relaxed">
              You can test waste inspection by uploading a photo below, or by using the Quick Test Presets.
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all cursor-pointer flex items-center gap-2 hover:-translate-y-0.5 active:scale-95"
            >
              <span>📁</span>
              <span>Upload Photo</span>
            </button>
          </div>
        )}
      </div>

      {/* Controller Buttons Bar */}
      <div className="glass-panel rounded-2xl p-4 sm:p-5 flex flex-col gap-4 max-w-2xl mx-auto w-full border border-slate-200/80 dark:border-slate-800/70 shadow-xl transition-all">
        {/* Tier 1: Target Bin Selection & Camera Mode Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 pb-3.5 border-b border-slate-200/70 dark:border-slate-800/70">
          {/* Target Bin Dropdown Group */}
          <div className="flex items-center gap-2.5 min-w-0">
            <label className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider shrink-0 font-mono flex items-center gap-1.5">
              <span>🎯</span>
              <span>Target Bin:</span>
            </label>
            <div className="relative flex-1 sm:w-52">
              <select
                value={targetBin}
                onChange={(e) => setTargetBin(e.target.value)}
                className="w-full bg-slate-100 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700/80 text-xs sm:text-sm text-slate-900 dark:text-white rounded-xl px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 font-medium transition-all cursor-pointer appearance-none shadow-sm"
              >
                <option value="Auto-Detect">Auto-Detect Stream</option>
                <option value="Dry Recyclable">Blue Bin (Dry Recyclable)</option>
                <option value="Wet Organic">Green Bin (Wet Organic)</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400 text-xs">
                ▼
              </div>
            </div>
          </div>

          {/* Camera Stream & File Actions */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-start sm:justify-end">
            {previewImage && isCameraOn && isStreaming && (
              <button
                onClick={handleReset}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-800 text-cyan-700 dark:text-cyan-300 hover:bg-slate-300 dark:hover:bg-slate-700 border border-cyan-500/30 flex items-center justify-center gap-1.5 flex-1 sm:flex-initial cursor-pointer hover:-translate-y-0.5 active:scale-95 transition-all shadow-sm whitespace-nowrap"
              >
                <span>📹</span>
                <span>Live Feed</span>
              </button>
            )}

            {/* Camera On / Off Toggle Button */}
            <button
              onClick={toggleCamera}
              id="camera-toggle-btn"
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 flex-1 sm:flex-initial cursor-pointer hover:-translate-y-0.5 active:scale-95 shadow-sm whitespace-nowrap ${
                isCameraOn
                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-300 dark:border-rose-500/30 hover:bg-rose-500/20'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30 hover:bg-emerald-500/20'
              }`}
              title={isCameraOn ? 'Turn off webcam camera' : 'Turn on webcam camera'}
            >
              <span>{isCameraOn ? '📷' : '🎥'}</span>
              <span>{isCameraOn ? 'Turn Off Camera' : 'Turn On Camera'}</span>
            </button>

            {/* Upload Photo Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 transition-all flex items-center justify-center gap-1.5 flex-1 sm:flex-initial cursor-pointer hover:-translate-y-0.5 active:scale-95 shadow-sm whitespace-nowrap"
            >
              <span>📁</span>
              <span>Upload Photo</span>
            </button>
          </div>
        </div>

        {/* Tier 2: Primary Inspection Action Bar */}
        <div>
          <button
            onClick={captureAndInspect}
            disabled={isProcessing}
            id="inspect-waste-btn"
            className="w-full py-3 px-6 rounded-xl text-xs sm:text-sm font-black bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/35 hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            {isProcessing ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Auditing Waste with AI Vision...</span>
              </>
            ) : (
              <>
                <span className="text-base sm:text-lg">📸</span>
                <span>Inspect Waste Item</span>
              </>
            )}
          </button>
        </div>

        {/* Tier 3: Quick Test Presets Row */}
        <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between gap-2.5 flex-wrap">
          <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1">
            <span>⚡</span>
            <span>Quick Test Presets:</span>
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleSamplePreset('phone')}
              className="text-[11px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-slate-300 dark:border-cyan-500/30 hover:border-cyan-500/50 font-medium hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer shadow-sm"
            >
              📱 Mobile Phone (E-Waste)
            </button>
            <button
              onClick={() => handleSamplePreset('bottle')}
              className="text-[11px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-slate-300 dark:border-emerald-500/30 hover:border-emerald-500/50 font-medium hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer shadow-sm"
            >
              🧴 PET Bottle (Clean)
            </button>
            <button
              onClick={() => handleSamplePreset('pizza')}
              className="text-[11px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-slate-300 dark:border-amber-500/30 hover:border-amber-500/50 font-medium hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer shadow-sm"
            >
              🍕 Greasy Pizza Box
            </button>
            <button
              onClick={() => handleSamplePreset('empty')}
              className="text-[11px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 font-medium hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer shadow-sm"
            >
              ⚪ Empty Frame
            </button>
          </div>
        </div>
      </div>

      {/* Real-time Advice & Remediation Card (Dedicated InspectionResult Component) */}
      <InspectionResult
        result={lastResult}
        onReset={handleReset}
        isScanning={isProcessing}
      />
    </div>
  );
};

export default CameraInspector;
