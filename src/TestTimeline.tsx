import { Box } from "@chakra-ui/react";
import React, { useRef, useEffect } from "react";

const TestTimeline = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let x = 10;
    const y = 100;
    const lineSpacing = 8;
    const lineLength = 5;
    const numLines = (8 * 60 * 60) / 10;
    const totalWidth = lineSpacing * numLines;
    canvasRef.current!.width = totalWidth;

    for (let i = 0; i < numLines; i++) {
      const makeBiggerLine = (i + 1) % 6 === 0;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + (makeBiggerLine ? 10 : lineLength));
      ctx.stroke();
      x += lineSpacing;
    }
  }, []);

  return (
    <Box maxW="100vw" overflow="scroll">
      <canvas ref={canvasRef} height="200" />
    </Box>
  );
};

export default TestTimeline;
