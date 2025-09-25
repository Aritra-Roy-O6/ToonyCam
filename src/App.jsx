"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import "./App.css"

function App() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null) // Store the stream reference
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState("")
  const animationRef = useRef(null)
  const [showCaptureModal, setShowCaptureModal] = useState(false)
  const [capturedImage, setCapturedImage] = useState(null)

  // Render video frame to canvas
  const renderVideoFrame = useCallback(() => {
    // Stop the loop if the camera is off
    if (!isStreaming || !videoRef.current || !canvasRef.current) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")

    if (video.readyState >= video.HAVE_CURRENT_DATA) {
      const width = video.videoWidth
      const height = video.videoHeight

      // Ensure canvas dimensions match video
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }

      // Draw the current video frame to the canvas
      ctx.drawImage(video, 0, 0, width, height)
    }

    // Continue the loop
    animationRef.current = requestAnimationFrame(renderVideoFrame)
  }, [isStreaming]) // Dependency on isStreaming to manage the loop

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
      animationRef.current = requestAnimationFrame(renderVideoFrame)
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
  }, [isStreaming, renderVideoFrame])

  // Capture image from the canvas
  const captureImage = useCallback(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    // Ensure the canvas is not blank before capturing
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
        
        {/* We have removed the cartoon toggle button for now */}
        
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