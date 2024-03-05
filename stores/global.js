'use client';
const type = {
  MODAL: 'MODAL',
  PORTFOLIOMODAL: 'PORTFOLIOMODAL',
  BLOGMODAL: 'BLOGMODAL',
  GALLERY: 'GALLERY'
};
const { MODAL, PORTFOLIOMODAL, BLOGMODAL, GALLERY } = type;

import { createContext, useCallback, useContext, useReducer } from 'react';

const context = createContext();

const reducer = (state, action) => {
  const { type, payload } = action;
  switch (type) {
    case MODAL:
      return {
        ...state,
        modal: payload
      };
    case PORTFOLIOMODAL:
      return {
        ...state,
        portfolioModal: payload
      };
    case BLOGMODAL:
      return {
        ...state,
        blogModal: payload
      };
    case GALLERY:
      return {
        ...state,
        gallery: payload
      };
    default:
      return state;
  }
};

const state = (props) => {
  const initialState = {
    modal: false,
    portfolioModal: null,
    blogModal: null,
    gallery: false,
    data: null
  };
  const [state, dispatch] = useReducer(reducer, initialState);

  const modalToggle = useCallback((value) => {
    console.log('modalToggle:value', value);
    dispatch({
      type: MODAL,
      payload: value
    });
  }, []);

  const setPortfolioModal = useCallback((value) => {
    console.log('setPortfolioModal:value', value);
    dispatch({
      type: PORTFOLIOMODAL,
      payload: value
    });
  }, []);
  const setBlogModal = useCallback((value) => {
    console.log('setBlogModal:value', value);
    dispatch({
      type: BLOGMODAL,
      payload: value
    });
  }, []);
  const setGallery = useCallback((value) => {
    console.log('setBlogModal:value', value);
    dispatch({
      type: GALLERY,
      payload: value
    });
  }, []);

  const { modal, portfolioModal, blogModal, gallery } = state;
  return (
    <context.Provider
      value={{
        modal,
        modalToggle,
        portfolioModal,
        setPortfolioModal,
        blogModal,
        setBlogModal,
        gallery,
        setGallery
      }}
    >
      {props.children}
    </context.Provider>
  );
};

const useGlobalContext = () => useContext(context);

export default state;

export { context, useGlobalContext };
