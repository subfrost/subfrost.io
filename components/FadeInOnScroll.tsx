"use client";

import { motion, useAnimation, useInView } from "framer-motion";
import { useEffect, useRef } from "react";

interface FadeInOnScrollProps {
  children: React.ReactNode;
}

const FadeInOnScroll: React.FC<FadeInOnScrollProps> = ({ children }) => {
  const controls = useAnimation();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.1 });

  useEffect(() => {
    if (isInView) {
      controls.start("visible");
    }
  }, [controls, isInView]);

  return (
    <motion.div
      ref={ref}
      animate={controls}
      initial="hidden"
      variants={{
        visible: { opacity: 1, y: 0 },
        hidden: { opacity: 0, y: 50 },
      }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
};

export default FadeInOnScroll;
