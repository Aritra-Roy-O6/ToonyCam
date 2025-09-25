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
    vec2 texel = 1.0 / u_resolution;

    // --- 1. Edge Detection (Sobel Operator) ---
    // Sample the brightness of neighboring pixels to detect edges.
    float tl = getBrightness(texture2D(videoTexture, vUv + texel * vec2(-1.0, 1.0)).rgb);
    float t  = getBrightness(texture2D(videoTexture, vUv + texel * vec2(0.0, 1.0)).rgb);
    float tr = getBrightness(texture2D(videoTexture, vUv + texel * vec2(1.0, 1.0)).rgb);
    float l  = getBrightness(texture2D(videoTexture, vUv + texel * vec2(-1.0, 0.0)).rgb);
    float r  = getBrightness(texture2D(videoTexture, vUv + texel * vec2(1.0, 0.0)).rgb);
    float bl = getBrightness(texture2D(videoTexture, vUv + texel * vec2(-1.0, -1.0)).rgb);
    float b  = getBrightness(texture2D(videoTexture, vUv + texel * vec2(0.0, -1.0)).rgb);
    float br = getBrightness(texture2D(videoTexture, vUv + texel * vec2(1.0, -1.0)).rgb);

    float sobelX = -tl - 2.0*l - bl + tr + 2.0*r + br;
    float sobelY = -tl - 2.0*t - tr + bl + 2.0*b + br;
    float edgeMagnitude = sqrt(sobelX*sobelX + sobelY*sobelY);

    // --- 2. Color Simplification (Posterization) ---
    // Get the original color for the current pixel.
    vec3 originalColor = texture2D(videoTexture, vUv).rgb;

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
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState("")
  const [threeReady, setThreeReady] = useState(false)
  
  const [showCaptureModal, setShowCaptureModal] = useState(false)
  const [capturedImage, setCapturedImage] = useState(null)
  
  // Ref to hold the three.js renderer
  const rendererRef = useRef(null)

  // Load three.js script
  useEffect(() => {
    // Check if script already exists
    if (document.querySelector('script[src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"]')) {
        if (window.THREE) setThreeReady(true);
        return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    script.async = true;
    script.onload = () => {
      console.log('three.js loaded');
      setThreeReady(true);
    };
    document.body.appendChild(script);
    return () => {
      // Only remove if this component instance added it
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  // Main effect to set up three.js scene
  useEffect(() => {
    if (!isStreaming || !threeReady || !videoRef.current || !canvasRef.current) {
        return;
    }
    
    if (!window.THREE) {
        console.error("Three.js is not available.");
        return;
    }

    // --- Three.js Setup ---
    const scene = new window.THREE.Scene();
    const camera = new window.THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const renderer = new window.THREE.WebGLRenderer({ canvas: canvasRef.current, preserveDrawingBuffer: true });
    rendererRef.current = renderer;

    const video = videoRef.current;
    renderer.setSize(video.videoWidth, video.videoHeight);
    canvasRef.current.width = video.videoWidth;
    canvasRef.current.height = video.videoHeight;
    
    const videoTexture = new window.THREE.VideoTexture(video);

    const uniforms = {
        videoTexture: { value: videoTexture },
        u_resolution: { value: new window.THREE.Vector2(video.videoWidth, video.videoHeight) },
    };

    const material = new window.THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
    });

    const geometry = new window.THREE.PlaneBufferGeometry(2, 2);
    const plane = new window.THREE.Mesh(geometry, material);
    scene.add(plane);

    let animationFrameId;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup function
    return () => {
      cancelAnimationFrame(animationFrameId);
      if (renderer) renderer.dispose();
      if (videoTexture) videoTexture.dispose();
      if (material) material.dispose();
      if (geometry) geometry.dispose();
    };
  }, [isStreaming, threeReady]);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      const constraints = {
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
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
      setError("Camera access denied. Please allow camera permissions and try again.");
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

  // Capture image from the WebGL canvas
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

  useEffect(() => () => stopCamera(), [stopCamera]);

  const handleCameraToggle = useCallback(() => {
    if (isStreaming) {
      stopCamera();
    } else {
      startCamera();
    }
  }, [isStreaming, startCamera, stopCamera]);

  return (
    <div className="toonycam-container no-scroll">
      <header className="toony-header sticky-top">
        <h1 className="toony-title small-title">ToonyCam</h1>
      </header>

      {error && (
        <div className="toony-error" role="alert">{error}</div>
      )}

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
    </div>
  )
}

export default App

