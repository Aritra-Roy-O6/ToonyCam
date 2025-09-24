"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import "./App.css"

function App() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [opencvReady, setOpencvReady] = useState(false)
  const [error, setError] = useState("")
  const animationRef = useRef(null)

  // Initialize OpenCV
  useEffect(() => {
    const checkOpenCV = () => {
      if (window.opencvReady && window.cv) {
        console.log("OpenCV is ready in React component")
        setOpencvReady(true)
      } else {
        setTimeout(checkOpenCV, 100)
      }
    }

    const handleOpenCVReady = () => {
      console.log("OpenCV ready event received")
      setOpencvReady(true)
    }

    window.addEventListener("opencvReady", handleOpenCVReady)
    checkOpenCV()

    return () => {
      window.removeEventListener("opencvReady", handleOpenCVReady)
    }
  }, [])

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
        setIsStreaming(true)
        setError("")
      }
    } catch (err) {
      console.error("Camera access error:", err)
      setError("Camera access denied. Please allow camera permissions.")
      setTimeout(() => setError("") , 2000)
    }
  }, [])

  // Process frame with cartoon effect
  const processFrame = useCallback(() => {
    if (!opencvReady || !window.cv || !videoRef.current || !canvasRef.current || !isStreaming) {
      return
    }

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      try {
        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        // Get image data for OpenCV processing
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const src = window.cv.matFromImageData(imageData)

        // Create working matrices
        const dst = new window.cv.Mat()
        const gray = new window.cv.Mat()
        const edges = new window.cv.Mat()
        const bilateral = new window.cv.Mat()

        // Apply bilateral filter for smoothing while preserving edges
        window.cv.bilateralFilter(src, bilateral, 15, 80, 80)

        // Convert to grayscale for edge detection
        window.cv.cvtColor(src, gray, window.cv.COLOR_RGBA2GRAY)

        // Apply median blur to reduce noise
        window.cv.medianBlur(gray, gray, 7)

        // Detect edges using Canny
        window.cv.Canny(gray, edges, 50, 150)

        // Convert edges back to RGBA
        window.cv.cvtColor(edges, edges, window.cv.COLOR_GRAY2RGBA)

        // Create cartoon effect by combining bilateral filter with edges
        const cartoon = new window.cv.Mat()
        window.cv.bitwise_and(bilateral, edges, cartoon)

        // Blend the bilateral filtered image with the edge-enhanced version
        window.cv.addWeighted(bilateral, 0.8, cartoon, 0.2, 0, dst)

        // Convert back to ImageData and draw to canvas
        const outputImageData = new ImageData(new Uint8ClampedArray(dst.data), dst.cols, dst.rows)
        ctx.putImageData(outputImageData, 0, 0)

        // Clean up matrices
        src.delete()
        dst.delete()
        gray.delete()
        edges.delete()
        bilateral.delete()
        cartoon.delete()
      } catch (err) {
        console.error("OpenCV processing error:", err)
        // Fallback: just show the original video frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      }
    }

    if (isProcessing) {
      animationRef.current = requestAnimationFrame(processFrame)
    }
  }, [opencvReady, isStreaming, isProcessing])

  // Toggle cartoon processing
  const toggleProcessing = useCallback(() => {
    if (!isProcessing) {
      setIsProcessing(true)
      processFrame()
    } else {
      setIsProcessing(false)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isProcessing, processFrame])

  // Capture image
  const captureImage = useCallback(() => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const link = document.createElement("a")
    link.download = `toonycam-${Date.now()}.png`
    link.href = canvas.toDataURL("image/png")
    link.click()
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks()
        tracks.forEach((track) => track.stop())
      }
    }
  }, [])

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
            <video ref={videoRef} className="hidden-video" autoPlay playsInline muted />
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
        <button className="cartoon-btn small-btn cam-btn" onClick={startCamera} disabled={isStreaming} title="Start Camera">
          {isStreaming ? "🎥" : "📷"}
        </button>
        <button className="cartoon-btn small-btn cartoon-toggle-btn" onClick={toggleProcessing} disabled={!isStreaming || !opencvReady} title="Toggle Cartoon">
          {isProcessing ? "🛑" : "✨"}
        </button>
        <button className="cartoon-btn small-btn capture-btn" onClick={captureImage} disabled={!isStreaming} title="Capture">
          📸
        </button>
      </div>
    </div>
  )
}

export default App
