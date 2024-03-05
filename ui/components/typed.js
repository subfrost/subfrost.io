'use client';
import React from 'react';
import Typed from 'typed.js';

export class TypedStrings extends React.Component {
  componentDidMount() {
    const { strings, options } = this.props;
    const _options = {
      ...options,
      strings: strings
    };
    this.typed = new Typed(this.el, _options);
  }

  componentWillUnmount() {
    this.typed.destroy();
  }

  render() {
    return (
      <div className="wrap">
        <div className="type-wrap">
          <span
            style={{ whiteSpace: 'pre' }}
            ref={(el) => {
              this.el = el;
            }}
            className={
              this.props?.size && this.props.size === 'lg' ? 'h-title' : ''
            }
          />
        </div>
      </div>
    );
  }
}
