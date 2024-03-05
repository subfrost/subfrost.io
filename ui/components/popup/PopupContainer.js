'use client';
import { context } from '@/stores/global';
import useClickOutside from '@/hooks/use-click-outside';
import { Fragment, useContext } from 'react';

const PopContainer = ({ children, nullValue }) => {
  const { modalToggle, modal } = useContext(context);
  let domNode = useClickOutside(() => {
    modalToggle(false);
    nullValue(null);
  });
  return (
    <Fragment>
      <div
        className="mfp-bg mfp-fade mfp-ready"
        onClick={(e) => {
          e.preventDefault();
          modalToggle(false);
          nullValue(null);
        }}
      ></div>
      <div
        className="mfp-wrap mfp-close-btn-in mfp-auto-cursor mfp-fade mfp-ready"
        tabIndex={-1}
        style={{ overflow: 'hidden auto' }}
      >
        <div className="mfp-container mfp-s-ready mfp-inline-holder">
          <div className="mfp-content" ref={domNode}>
            <div id="popup-2" className="popup-box mfp-fade">
              {children}
              <button
                onClick={(e) => {
                  e.preventDefault();
                  modalToggle(false);
                  nullValue(null);
                }}
                title="Close (Esc)"
                type="button"
                className="mfp-close"
              >
                ×
              </button>
            </div>
          </div>
          <div className="mfp-preloader">Loading...</div>
        </div>
      </div>
    </Fragment>
  );
};
export default PopContainer;
