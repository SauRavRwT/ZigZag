import React, { useState, useEffect, useCallback, useRef } from "react";
import "./Game.css";

// Helper function to calculate distance from a point to a line segment
const pointToLineDistance = (px, py, x1, y1, x2, y2) => {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = px - xx;
  const dy = py - yy;

  return Math.sqrt(dx * dx + dy * dy);
};

const Game = () => {
  const [level, setLevel] = useState(() => {
    const savedLevel = localStorage.getItem("currentLevel");
    return savedLevel ? parseInt(savedLevel) : 1;
  });
  const [points, setPoints] = useState([]);
  const [currentPoint, setCurrentPoint] = useState(1);
  const [path, setPath] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [bestLevel, setBestLevel] = useState(() => {
    const saved = localStorage.getItem("bestLevel");
    return saved ? parseInt(saved) : 1;
  });
  const [nearPoints, setNearPoints] = useState([]);
  const boardRef = useRef(null);
  const lastValidPointRef = useRef(null);

  // Reduce these values to make it easier to navigate between points
  const INTERSECTION_THRESHOLD = 0.2; // Reduced from 0.25
  const WARNING_THRESHOLD = 0.3; // Reduced from 0.4
  const POINT_DETECTION_RADIUS = 0.15; // Increased from 0.1 for easier point selection

  const gridSize = Math.min(
    Math.floor(window.innerWidth * 0.8),
    Math.floor(window.innerHeight * 0.8)
  );
  const generatePoints = useCallback(() => {
    const numPoints = level + 2; // Increase points as level increases
    const newPoints = [];
    const gridSize = 8; // Fixed grid size for simplicity
    const padding = 1; // Keep points 1 cell away from borders
    const usedPositions = new Set();

    for (let i = 0; i < numPoints; i++) {
      let position;
      do {
        position = {
          x: padding + Math.floor(Math.random() * (gridSize - 2 * padding)),
          y: padding + Math.floor(Math.random() * (gridSize - 2 * padding)),
          number: i + 1,
        };
      } while (usedPositions.has(`${position.x},${position.y}`));

      usedPositions.add(`${position.x},${position.y}`);
      newPoints.push(position);
    }
    return newPoints;
  }, [level]);

  const handleSuccess = useCallback(() => {
    const newLevel = level + 1;
    setLevel(newLevel);
    if (newLevel > bestLevel) {
      setBestLevel(newLevel);
      localStorage.setItem("bestLevel", newLevel.toString());
    }
    localStorage.setItem("currentLevel", newLevel.toString());
  }, [level, bestLevel]);

  const initializeLevel = useCallback(() => {
    const newPoints = generatePoints();
    setPoints(newPoints);
    setCurrentPoint(1);
    setPath([]);
  }, [generatePoints]);

  // Add helper for calculating valid path zone
  const isInValidPathZone = (x, y, startPoint, endPoint) => {
    // Calculate the ideal path width
    const pathWidth = 0.4; // Width of the valid path zone

    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    // If points are too close, allow more freedom of movement
    if (length < 1) return true;

    // Calculate normalized perpendicular vector
    const perpX = -dy / length;
    const perpY = dx / length;

    // Calculate relative position of the point
    const pointX = x - startPoint.x;
    const pointY = y - startPoint.y;

    // Project point onto path
    const proj = (pointX * dx + pointY * dy) / length;

    // Check if point is within path bounds
    if (proj < 0 || proj > length) return false;

    // Calculate distance from path center
    const dist = Math.abs(pointX * perpX + pointY * perpY);

    return dist <= pathWidth;
  };

  const getPointFromPosition = useCallback(
    (clientX, clientY) => {
      if (!boardRef.current) return null;

      const rect = boardRef.current.getBoundingClientRect();
      const relativeX = (clientX - rect.left) / rect.width;
      const relativeY = (clientY - rect.top) / rect.height;

      // Convert to grid coordinates (0-8)
      const gridX = relativeX * 8;
      const gridY = relativeY * 8;

      return points.find((point) => {
        const distance = Math.sqrt(
          Math.pow(point.x - gridX, 2) + Math.pow(point.y - gridY, 2)
        );
        return distance < POINT_DETECTION_RADIUS;
      });
    },
    [points]
  );

  const handlePointerDown = useCallback(
    (e) => {
      e.preventDefault();
      const clientX = e.clientX ?? e.touches[0].clientX;
      const clientY = e.clientY ?? e.touches[0].clientY;
      const point = getPointFromPosition(clientX, clientY);

      if (
        point &&
        ((point.number === 1 && !path.length) || point.number === currentPoint)
      ) {
        setIsDragging(true);
        if (!path.length) {
          setPath([point]);
          setCurrentPoint(2);
        }
        lastValidPointRef.current = point;
        setMousePosition({ x: clientX, y: clientY });
      }
    },
    [getPointFromPosition, path.length, currentPoint]
  );
  const handleWrongConnection = useCallback(
    (wrongPoint) => {
      wrongPoint.isError = true;
      setPoints([...points]); // Force re-render to show error state
      setIsDragging(false);

      setTimeout(() => {
        setLevel(1);
        initializeLevel();
      }, 1000);
    },
    [points, initializeLevel]
  );
  const checkIntermediatePoints = useCallback(
    (lineStart, lineEnd, currentX, currentY) => {
      const nearbyPoints = [];

      // Only check intermediate points if we're not in the valid path zone
      if (!isInValidPathZone(currentX, currentY, lineStart, lineEnd)) {
        const intersectingPoint = points.find((p) => {
          if (p === lastValidPointRef.current || p.number === currentPoint)
            return false;

          const distance = pointToLineDistance(
            p.x,
            p.y,
            lineStart.x,
            lineStart.y,
            currentX,
            currentY
          );

          if (distance < WARNING_THRESHOLD) {
            nearbyPoints.push(p);
          }

          return distance < INTERSECTION_THRESHOLD;
        });

        setNearPoints(nearbyPoints);
        return intersectingPoint;
      }

      setNearPoints([]);
      return null;
    },
    [points, currentPoint]
  );

  // Update the handlePointerMove function
  const handlePointerMove = useCallback(
    (e) => {
      if (!isDragging) return;
      e.preventDefault();

      // Use RequestAnimationFrame for smooth updates
      requestAnimationFrame(() => {
        const clientX = e.clientX ?? e.touches[0].clientX;
        const clientY = e.clientY ?? e.touches[0].clientY;

        // Cache the board rect to avoid reflow
        const rect = boardRef.current.getBoundingClientRect();
        const relativeX = ((clientX - rect.left) / rect.width) * 8;
        const relativeY = ((clientY - rect.top) / rect.height) * 8;

        // Debounce mouse position updates
        if (
          Math.abs(mousePosition.x - clientX) > 1 ||
          Math.abs(mousePosition.y - clientY) > 1
        ) {
          setMousePosition({ x: clientX, y: clientY });
        }

        // Check if any intermediate point is in the path
        const lastPoint = lastValidPointRef.current;
        const lineStart = { x: lastPoint.x, y: lastPoint.y };

        const intersectingPoint = checkIntermediatePoints(
          lineStart,
          { x: relativeX, y: relativeY },
          relativeX,
          relativeY
        );

        if (intersectingPoint) {
          handleWrongConnection(intersectingPoint);
          return;
        }

        const point = getPointFromPosition(clientX, clientY);
        if (point && !path.includes(point)) {
          if (point.number === currentPoint) {
            lastValidPointRef.current = point;
            setPath([...path, point]);
            setCurrentPoint(point.number + 1);
            setNearPoints([]); // Clear near points when a valid point is connected

            if (point.number === points.length) {
              setIsDragging(false);
              setTimeout(handleSuccess, 500);
            }
          } else if (point.number !== currentPoint) {
            handleWrongConnection(point);
          }
        }
      });
    },
    [
      isDragging,
      path,
      points,
      currentPoint,
      getPointFromPosition,
      handleSuccess,
      handleWrongConnection,
      checkIntermediatePoints,
      mousePosition,
    ]
  );

  const handlePointerUp = useCallback(() => {
    if (isDragging) {
      const lastPoint = lastValidPointRef.current;
      if (!lastPoint || lastPoint.number < points.length) {
        setLevel(1);
        setTimeout(initializeLevel, 500);
      }
      setIsDragging(false);
      lastValidPointRef.current = null;
      setNearPoints([]); // Clear near points when dragging ends
    }
  }, [isDragging, points.length, initializeLevel]);

  useEffect(() => {
    initializeLevel();
  }, [initializeLevel]);

  useEffect(() => {
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointermove", handlePointerMove);
    return () => {
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, [handlePointerUp, handlePointerMove]);

  // Add touch specific event handling
  useEffect(() => {
    if (!boardRef.current) return;

    const board = boardRef.current;
    const options = { passive: false };

    board.addEventListener("touchstart", handlePointerDown, options);
    board.addEventListener("touchmove", handlePointerMove, options);
    board.addEventListener("touchend", handlePointerUp, options);
    board.addEventListener("touchcancel", handlePointerUp, options);

    return () => {
      board.removeEventListener("touchstart", handlePointerDown, options);
      board.removeEventListener("touchmove", handlePointerMove, options);
      board.removeEventListener("touchend", handlePointerUp, options);
      board.removeEventListener("touchcancel", handlePointerUp, options);
    };
  }, [handlePointerDown, handlePointerMove, handlePointerUp]);

  return (
    <div className="game">      <div className="game-header">
        <h1 className="game-title">ZigZag</h1>
      </div>

      <div className="level-info">
        <p className="level-text">Level {level}</p>
      </div>

      <div className="game-stats">
        <h3 className="stats-title">Best Level</h3>
        <p className="stats-value">{bestLevel}</p>
      </div>

      <div
        className="game-board"
        style={{ width: gridSize, height: gridSize }}
        ref={boardRef}
        onPointerDown={handlePointerDown}
      >
        {points.map((point, index) => (
          <div
            key={index}
            className={`point 
              ${path.includes(point) ? "connected" : ""} 
              ${point.number === currentPoint ? "current" : ""} 
              ${point.isError ? "error" : ""}
              ${nearPoints.includes(point) ? "near-line" : ""}`}
            style={{
              left: `${(point.x * 100) / 8}%`,
              top: `${(point.y * 100) / 8}%`,
            }}
          >
            {point.number}
          </div>
        ))}

        {path.map((point, index) => {
          if (index < path.length - 1) {
            const nextPoint = path[index + 1];
            const angle =
              Math.atan2(nextPoint.y - point.y, nextPoint.x - point.x) *
              (180 / Math.PI);
            const length =
              Math.sqrt(
                Math.pow(nextPoint.x - point.x, 2) +
                  Math.pow(nextPoint.y - point.y, 2)
              ) *
              (100 / 8);

            return (
              <div
                key={`line-${index}`}
                className="line"
                style={{
                  left: `${(point.x * 100) / 8}%`,
                  top: `${(point.y * 100) / 8}%`,
                  width: `${length}%`,
                  transform: `rotate(${angle}deg)`,
                }}
              />
            );
          }
          return null;
        })}

        {isDragging && path.length > 0 && (
          <div
            className="line current-line"
            style={{
              left: `${(lastValidPointRef.current.x * 100) / 8}%`,
              top: `${(lastValidPointRef.current.y * 100) / 8}%`,
              width: `${Math.hypot(
                mousePosition.x -
                  boardRef.current.getBoundingClientRect().left -
                  (lastValidPointRef.current.x * boardRef.current.clientWidth) /
                    8,
                mousePosition.y -
                  boardRef.current.getBoundingClientRect().top -
                  (lastValidPointRef.current.y *
                    boardRef.current.clientHeight) /
                    8
              )}px`,
              transform: `rotate(${
                Math.atan2(
                  mousePosition.y -
                    boardRef.current.getBoundingClientRect().top -
                    (lastValidPointRef.current.y *
                      boardRef.current.clientHeight) /
                      8,
                  mousePosition.x -
                    boardRef.current.getBoundingClientRect().left -
                    (lastValidPointRef.current.x *
                      boardRef.current.clientWidth) /
                      8
                ) *
                (180 / Math.PI)
              }deg)`,
            }}
          />
        )}
      </div>
    </div>
  );
};

export default Game;
