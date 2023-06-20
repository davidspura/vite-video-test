import { Box } from "@chakra-ui/react";
import { MouseEvent, useRef } from "react";

// export default function Player() {
//   const box = useRef<HTMLDivElement>(null);
//   return <Box bg="blackAlpha.500" h="80px" w="50px" ref={box}></Box>;
// }

export class Timeline {
  box: HTMLDivElement | null = null;
  update = (duration: number) => {
    if (this.box && duration) {
      const width = duration / 1000;
      console.log("width: ", width);
      this.box.style.width = `${width}px`;
    }
  };

  seek = (e: MouseEvent) => {
    const box = e.target as HTMLDivElement;
    console.log(box.offsetWidth);
    console.log(e.clientX);
  };

  render = () => (
    <Box maxW="100vw" overflow="auto">
      <Box
        onClick={this.seek}
        bg="blackAlpha.500"
        h="80px"
        w="0px"
        ref={(e) => (this.box = e)}
      />
    </Box>
  );
}
