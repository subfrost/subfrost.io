'use client';
import { useEffect } from 'react';
import { TypedStrings } from '@/ui/components/typed';

export const Preloader = () => {
  useEffect(() => {
    var preInner = document.querySelector('.preloader .pre-inner');

    // Fade out .pre-inner element
    fadeOut(preInner, 2000, function () {
      // Preload hide
      var preloader = document.querySelector('.preloader');
      preloader.style.display = 'none';

      // Add 'loaded' class to body
      document.body.classList.add('loaded');
    });

    function fadeOut(element, duration, callback) {
      var opacity = 6;
      var interval = 1000 / 60; // 60 frames per second
      var step = opacity / (duration / interval);

      function updateOpacity() {
        opacity -= step;
        element.style.opacity = opacity;

        if (opacity <= 0) {
          clearInterval(fadeInterval);
          if (typeof callback === 'function') {
            callback();
          }
        }
      }
      var fadeInterval = setInterval(updateOpacity, interval);
    }
  }, []);

  return (
    <div className="preloader">
      <div className="centrize full-width">
        <div className="vertical-center">
          <div className="pre-inner">
            <TypedStrings
              strings={['loading...']}
              options={{
                loop: false,
                typeSpeed: 60
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
