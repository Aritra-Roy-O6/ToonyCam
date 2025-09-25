"use client"

import { useState, useRef, useEffect, useCallback } from "react"

function App() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null) // Store the stream reference
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState("")
  const animationRef = useRef(null)
  const [showCaptureModal, setShowCaptureModal] = useState(false)
  const [capturedImage, setCapturedImage] = useState(null)
  
  // Create a ref for a hidden canvas used for processing
  const processingCanvasRef = useRef(null)

  // Render video frame to canvas and apply cartoon effect using pixel manipulation
  const processFrame = useCallback(() => {
    // Stop the loop if the camera is off
    if (!isStreaming || !videoRef.current || !canvasRef.current || !processingCanvasRef.current) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    const video = videoRef.current
    const displayCanvas = canvasRef.current
    const displayCtx = displayCanvas.getContext("2d")
    
    const processingCanvas = processingCanvasRef.current
    const processingCtx = processingCanvas.getContext("2d")

    if (video.readyState >= video.HAVE_CURRENT_DATA) {
      const videoWidth = video.videoWidth
      const videoHeight = video.videoHeight

      // Ensure display canvas dimensions match video
      if (displayCanvas.width !== videoWidth || displayCanvas.height !== videoHeight) {
        displayCanvas.width = videoWidth
        displayCanvas.height = videoHeight
      }

      // --- Start Optimization ---
      // Define a scale factor to process a smaller image
      const scaleFactor = 0.5; // Process at 50% resolution
      const processingWidth = videoWidth * scaleFactor;
      const processingHeight = videoHeight * scaleFactor;

      // Set the processing canvas to the smaller size
      if (processingCanvas.width !== processingWidth || processingCanvas.height !== processingHeight) {
        processingCanvas.width = processingWidth;
        processingCanvas.height = processingHeight;
      }
      
      // Draw the video frame onto the small processing canvas
      processingCtx.drawImage(video, 0, 0, processingWidth, processingHeight);
      // --- End Optimization ---

      try {
        // Perform all heavy processing on the smaller canvas
        const originalImageData = processingCtx.getImageData(0, 0, processingWidth, processingHeight);
        const processedImageData = processingCtx.getImageData(0, 0, processingWidth, processingHeight);
        
        const originalData = originalImageData.data;
        const processedData = processedImageData.data;

        // 1. Color Quantization (Posterization)
        const levels = 7; 
        const step = 255 / (levels - 1);
        for (let i = 0; i < processedData.length; i += 4) {
          processedData[i] = Math.round(processedData[i] / step) * step;
          processedData[i + 1] = Math.round(processedData[i + 1] / step) * step;
          processedData[i + 2] = Math.round(processedData[i + 2] / step) * step;
        }

        // 2. Edge Detection (Sobel Operator)
        const edgeThreshold = 80; // Increased from 50 to reduce noise

        for (let y = 1; y < processingHeight - 1; y++) {
          for (let x = 1; x < processingWidth - 1; x++) {
            const i = (y * processingWidth + x) * 4;
            
            const getGray = (data, index) => 
              0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];

            const topLeft = getGray(originalData, i - (processingWidth * 4) - 4);
            const top = getGray(originalData, i - (processingWidth * 4));
            const topRight = getGray(originalData, i - (processingWidth * 4) + 4);
            const left = getGray(originalData, i - 4);
            const right = getGray(originalData, i + 4);
            const bottomLeft = getGray(originalData, i + (processingWidth * 4) - 4);
            const bottom = getGray(originalData, i + (processingWidth * 4));
            const bottomRight = getGray(originalData, i + (processingWidth * 4) + 4);

            const sobelX = -topLeft - 2 * left - bottomLeft + topRight + 2 * right + bottomRight;
            const sobelY = -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight;

            const magnitude = Math.sqrt(sobelX * sobelX + sobelY * sobelY);

            // 3. Combine posterized color with dark edges
            if (magnitude > edgeThreshold) {
              processedData[i] = 0;
              processedData[i + 1] = 0;
              processedData[i + 2] = 0;
            }
          }
        }

        // Put the processed data back onto the small canvas
        processingCtx.putImageData(processedImageData, 0, 0);
        
        // --- Final Render ---
        // Disable smoothing to get a crisp, pixelated look when scaling up
        displayCtx.imageSmoothingEnabled = false;
        // Draw the small, processed canvas onto the large display canvas
        displayCtx.drawImage(processingCanvas, 0, 0, videoWidth, videoHeight);

      } catch (err) {
          console.error("Pixel processing error:", err)
          // Fallback to drawing the normal video frame if an error occurs
          displayCtx.drawImage(video, 0, 0, videoWidth, videoHeight);
      }
    }

    // Continue the loop
    animationRef.current = requestAnimationFrame(processFrame)
  }, [isStreaming]) // Dependency on streaming state

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: false
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play()
          setIsStreaming(true)
          setError("")
        }
      }
    } catch (err) {
      console.error("Camera access error:", err)
      setError("Camera access denied. Please allow camera permissions and try again.")
      setTimeout(() => setError(""), 3000)
    }
  }, [])

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    
    // The render loop will stop on its own because isStreaming will be false
    setIsStreaming(false)
    setError("")
  }, [])

  // Start/stop the rendering loop when streaming state changes
  useEffect(() => {
    if (isStreaming) {
      // Changed to call the new processing function
      animationRef.current = requestAnimationFrame(processFrame)
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
    // Cleanup function to cancel animation frame when component unmounts
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isStreaming, processFrame]) // Updated dependency

  // Capture image from the canvas
  const captureImage = useCallback(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    if (canvas.width === 0 || canvas.height === 0) {
      console.error("Cannot capture image from a blank canvas.");
      return;
    }
    const dataUrl = canvas.toDataURL("image/png")
    setCapturedImage(dataUrl)
    setShowCaptureModal(true)
  }, [])

  // Download the captured image
  const handleSaveCapture = () => {
    if (!capturedImage) return
    const link = document.createElement("a")
    link.download = `toonycam-${Date.now()}.png`
    link.href = capturedImage
    document.body.appendChild(link) // Required for Firefox
    link.click()
    document.body.removeChild(link)
    
    setShowCaptureModal(false)
    setCapturedImage(null)
  }

  // Close the modal without saving
  const handleDiscardCapture = () => {
    setShowCaptureModal(false)
    setCapturedImage(null)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  // Handle camera button click
  const handleCameraToggle = useCallback(() => {
    if (isStreaming) {
      stopCamera()
    } else {
      startCamera()
    }
  }, [isStreaming, startCamera, stopCamera])

  return (
    <div className="toonycam-container no-scroll">
      <header className="toony-header sticky-top">
        <h1 className="toony-title small-title">ToonyCam</h1>
      </header>

      {error && (
        <div className="toony-error" role="alert">
          {error}
        </div>
      )}

      <div className="main-content-flex">
        <div className="video-section big-video">
          <div className="cartoon-video-frame">
            <video 
              ref={videoRef} 
              className="hidden-video" 
              autoPlay 
              playsInline 
              muted 
            />
            <canvas ref={canvasRef} className="output-canvas" />
            
            {/* Add a hidden canvas for off-screen processing */}
            <canvas ref={processingCanvasRef} style={{ display: 'none' }} />

            {!isStreaming && (
              <div className="canvas-overlay">
                <h3>Click "Start Camera" to begin</h3>
                <p>Allow camera permissions when prompted</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="controls-section sticky-bottom">
        <button 
          className="cartoon-btn small-btn cam-btn" 
          onClick={handleCameraToggle} 
          title={isStreaming ? "Stop Camera" : "Start Camera"}
        >
          {isStreaming ? "🛑" : "📷"}
        </button>
        
        <button 
          className="cartoon-btn small-btn capture-btn" 
          onClick={captureImage} 
          disabled={!isStreaming} 
          title="Capture Photo"
        >
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