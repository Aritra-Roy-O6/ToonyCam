"use client"

import { useState, useRef, useEffect, useCallback } from "react"

// Shader code is now embedded in the component.
// This vertex shader is standard boilerplate for positioning the video plane.
const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// This fragment shader does all the visual processing on the GPU.
const fragmentShader = `
  varying vec2 vUv;
  uniform sampler2D videoTexture;
  uniform vec2 u_resolution; // The resolution of the canvas

  // Function to get the brightness (luminance) of a color
  float getBrightness(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
  }

  void main() {
    // Aspect ratio is now handled by scaling the plane, so we use the default UVs.
    vec2 correctedUv = vUv;

    vec2 texel = 1.0 / u_resolution;

    // --- 1. Edge Detection (Sobel Operator) ---
    // Sample the brightness of neighboring pixels to detect edges.
    float tl = getBrightness(texture2D(videoTexture, correctedUv + texel * vec2(-1.0, 1.0)).rgb);
    float t  = getBrightness(texture2D(videoTexture, correctedUv + texel * vec2(0.0, 1.0)).rgb);
    float tr = getBrightness(texture2D(videoTexture, correctedUv + texel * vec2(1.0, 1.0)).rgb);
    float l  = getBrightness(texture2D(videoTexture, correctedUv + texel * vec2(-1.0, 0.0)).rgb);
    float r  = getBrightness(texture2D(videoTexture, correctedUv + texel * vec2(1.0, 0.0)).rgb);
    float bl = getBrightness(texture2D(videoTexture, correctedUv + texel * vec2(-1.0, -1.0)).rgb);
    float b  = getBrightness(texture2D(videoTexture, correctedUv + texel * vec2(0.0, -1.0)).rgb);
    float br = getBrightness(texture2D(videoTexture, correctedUv + texel * vec2(1.0, -1.0)).rgb);

    float sobelX = -tl - 2.0*l - bl + tr + 2.0*r + br;
    float sobelY = -tl - 2.0*t - tr + bl + 2.0*b + br;
    float edgeMagnitude = sqrt(sobelX*sobelX + sobelY*sobelY);

    // --- 2. Color Simplification (Posterization) ---
    // Get the original color for the current pixel.
    vec3 originalColor = texture2D(videoTexture, correctedUv).rgb;

    // Reduce the number of colors to create flat, cartoon-like shading.
    float levels = 4.0; // Fewer levels for a more distinct anime look.
    vec3 posterizedColor = floor(originalColor * levels) / levels;

    // --- 3. Combine Lines and Color ---
    // If a strong edge is detected, draw a black line. Otherwise, use the simplified color.
    float edgeThreshold = 0.4;
    vec3 finalColor = (edgeMagnitude > edgeThreshold) ? vec3(0.0) : posterizedColor;

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;


function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState("");
  const [threeReady, setThreeReady] = useState(false);
  
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  
  const rendererRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [facingMode, setFacingMode] = useState('user');
  
  const [isMobile, setIsMobile] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState(null);


  // Detect if the device is mobile (for flip camera button)
  useEffect(() => {
    const mobileCheck = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    setIsMobile(mobileCheck);
  }, []);

  // Load three.js script
  useEffect(() => {
    if (document.querySelector('script[src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"]')) {
        if (window.THREE) setThreeReady(true);
        return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    script.async = true;
    script.onload = () => setThreeReady(true);
    document.body.appendChild(script);
    return () => {
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, []);

  // Main effect to set up three.js scene
  useEffect(() => {
    if (!isStreaming || !threeReady || !videoRef.current || !canvasRef.current || !window.THREE) {
        return;
    }

    const scene = new window.THREE.Scene();
    const camera = new window.THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const renderer = new window.THREE.WebGLRenderer({ canvas: canvasRef.current, preserveDrawingBuffer: true });
    rendererRef.current = renderer;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // --- FIX for ZOOM: Match renderer size to the actual canvas display size ---
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    
    const videoTexture = new window.THREE.VideoTexture(video);

    const uniforms = {
        videoTexture: { value: videoTexture },
        u_resolution: { value: new window.THREE.Vector2(canvas.clientWidth, canvas.clientHeight) },
    };

    const material = new window.THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
    });

    const geometry = new window.THREE.PlaneBufferGeometry(2, 2);
    const plane = new window.THREE.Mesh(geometry, material);

    // --- FIX FOR ZOOM: Scale the plane mesh itself to match the video's aspect ratio ---
    const videoAspect = video.videoWidth / video.videoHeight;
    const canvasAspect = canvas.clientWidth / canvas.clientHeight;
    if (canvasAspect > videoAspect) {
        // Canvas is wider than video, so scale plane's X to fit
        plane.scale.x = videoAspect / canvasAspect;
    } else {
        // Canvas is taller than video, so scale plane's Y to fit
        plane.scale.y = canvasAspect / videoAspect;
    }
    
    scene.add(plane);

    let animationFrameId;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (renderer) renderer.dispose();
      if (videoTexture) videoTexture.dispose();
      if (material) material.dispose();
      if (geometry) geometry.dispose();
    };
  }, [isStreaming, threeReady]);

  // Start camera
  const startCamera = useCallback(async (currentFacingMode) => {
    try {
      const constraints = {
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: currentFacingMode },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setIsStreaming(true);
          setError("");
        };
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setError("Camera access denied or camera not found.");
      setTimeout(() => setError(""), 3000);
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
    setError("");
  }, []);

  const handleCameraToggle = useCallback(() => {
    if (isStreaming) stopCamera();
    else startCamera(facingMode);
  }, [isStreaming, startCamera, stopCamera, facingMode]);
  
  const handleFlipCamera = useCallback(async () => {
      if (!isStreaming || !streamRef.current) return;

      // Stop the current tracks without changing the main streaming state
      streamRef.current.getTracks().forEach(track => track.stop());

      const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
      setFacingMode(newFacingMode);

      try {
        const constraints = {
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: newFacingMode },
          audio: false,
        };
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        streamRef.current = newStream;
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
          videoRef.current.play(); // Ensure playback continues
        }
      } catch (err) {
        console.error("Camera flip error:", err);
        setError("Could not switch camera.");
        setTimeout(() => setError(""), 3000);
        // If flipping fails, stop everything to avoid a broken state
        stopCamera();
      }
  }, [isStreaming, facingMode, stopCamera]);


  const startRecording = useCallback(() => {
    if (!canvasRef.current || isRecording) return;
    
    const recordedChunks = [];
    const stream = canvasRef.current.captureStream(30); 
    mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });

    mediaRecorderRef.current.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setRecordedVideoUrl(url); // Set URL for review modal
      setShowVideoModal(true);   // Show review modal
    };

    mediaRecorderRef.current.start();
    setIsRecording(true);
  }, [isRecording]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const handleRecordToggle = useCallback(() => {
    if (isRecording) stopRecording();
    else startRecording();
  }, [isRecording, startRecording, stopRecording]);

  const captureImage = useCallback(() => {
    if (!rendererRef.current) return;
    const dataUrl = rendererRef.current.domElement.toDataURL("image/png");
    setCapturedImage(dataUrl);
    setShowCaptureModal(true);
  }, []);

  const handleSaveCapture = () => {
    if (!capturedImage) return;
    const link = document.createElement("a");
    link.download = `toonycam-${Date.now()}.png`;
    link.href = capturedImage;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowCaptureModal(false);
    setCapturedImage(null);
  };

  const handleDiscardCapture = () => {
    setShowCaptureModal(false);
    setCapturedImage(null);
  };
  
  const handleSaveVideo = () => {
    if (!recordedVideoUrl) return;
    const a = document.createElement('a');
    a.href = recordedVideoUrl;
    a.download = `toonycam-recording-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Keep URL for potential re-saving, discard will handle cleanup
  };

  const handleDiscardVideo = () => {
    if (recordedVideoUrl) {
      URL.revokeObjectURL(recordedVideoUrl);
    }
    setShowVideoModal(false);
    setRecordedVideoUrl(null);
  };


  useEffect(() => () => stopCamera(), [stopCamera]);

  return (
    <div className="toonycam-container no-scroll">
      <header className="toony-header sticky-top">
        <h1 className="toony-title small-title">ToonyCam</h1>
      </header>

      {error && <div className="toony-error" role="alert">{error}</div>}

      <div className="main-content-flex">
        <div className="video-section big-video">
          <div className="cartoon-video-frame">
            <video ref={videoRef} className="hidden-video" autoPlay playsInline muted />
            <canvas ref={canvasRef} className="output-canvas" />
            
            {!isStreaming && (
              <div className="canvas-overlay">
                <h3>Click "Start Camera" to begin</h3>
                <p>Allow camera permissions when prompted</p>
                {!threeReady && <p>Loading graphics library...</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="controls-section sticky-bottom">
        <button className="cartoon-btn small-btn cam-btn" onClick={handleCameraToggle} title={isStreaming ? "Stop Camera" : "Start Camera"}>
          {isStreaming ? "🛑" : "📷"}
        </button>

        {isStreaming && (
            <>
                <button className="cartoon-btn small-btn record-btn" onClick={handleRecordToggle} title={isRecording ? "Stop Recording" : "Start Recording"}>
                  {isRecording ? "⏹️" : "⚫️"}
                </button>
                {isMobile && (
                  <button className="cartoon-btn small-btn flip-btn" onClick={handleFlipCamera} title="Flip Camera">
                    🔄
                  </button>
                )}
            </>
        )}
        
        <button className="cartoon-btn small-btn capture-btn" onClick={captureImage} disabled={!isStreaming} title="Capture Photo">
          📸
        </button>
      </div>

      {showCaptureModal && capturedImage && (
        <div className="capture-modal-overlay">
          <div className="capture-modal">
            <img src={capturedImage} alt="Captured" className="capture-modal-img" />
            <div className="capture-modal-actions">
              <button className="cartoon-btn save-btn" onClick={handleSaveCapture}>Save</button>
              <button className="cartoon-btn discard-btn" onClick={handleDiscardCapture}>Discard</button>
            </div>
          </div>
        </div>
      )}

      {showVideoModal && recordedVideoUrl && (
        <div className="capture-modal-overlay">
          <div className="capture-modal">
            <video src={recordedVideoUrl} controls autoPlay loop className="capture-modal-img" />
            <div className="capture-modal-actions">
              <button className="cartoon-btn save-btn" onClick={handleSaveVideo}>Save Video</button>
              <button className="cartoon-btn discard-btn" onClick={handleDiscardVideo}>Discard</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App

