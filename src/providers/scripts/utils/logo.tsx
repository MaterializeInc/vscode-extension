import React from 'react';

interface Props {
    theme?: string
}

export const SVGLogo = ({ theme }: Props) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      width="40px"
      height="33px"
      viewBox="0 0 39 33"
      version="1.1"
      style={(!theme || theme.includes("Dark")) ? {} : { filter: 'invert(100%)' }}
    >
      <defs>
        <filter id="alpha" filterUnits="objectBoundingBox" x="0%" y="0%" width="100%" height="100%">
          <feColorMatrix
            type="matrix"
            in="SourceGraphic"
            values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"
          />
        </filter>
        <mask id="mask0">
          <g filter="url(#alpha)">
            <rect
              x="0"
              y="0"
              width="39"
              height="33"
              style={{ fill: 'rgb(0%,0%,0%)', fillOpacity: 0.701961, stroke: 'none' }}
            />
          </g>
        </mask>
        <clipPath id="clip1">
          <rect x="0" y="0" width="39" height="33" />
        </clipPath>
        <g id="surface5" clipPath="url(#clip1)">
          <path
            style={{
              stroke: 'none',
              fillRule: 'nonzero',
              fill: 'rgb(100%,100%,100%)',
              fillOpacity: 1,
            }}
            d="M 39.324219 -0.230469 L 39.324219 4.601562 L 39.316406 33.222656 L 31.648438 33.222656 L 31.648438 2.582031 L 34.050781 0.105469 C 34.152344 -0.00390625 34.277344 -0.09375 34.414062 -0.152344 C 34.554688 -0.210938 34.703125 -0.238281 34.851562 -0.230469 Z M 39.324219 -0.230469 "
          />
        </g>
        <mask id="mask1">
          <g filter="url(#alpha)">
            <rect
              x="0"
              y="0"
              width="39"
              height="33"
              style={{ fill: 'rgb(0%,0%,0%)', fillOpacity: 0.701961, stroke: 'none' }}
            />
          </g>
        </mask>
        <clipPath id="clip2">
          <rect x="0" y="0" width="39" height="33" />
        </clipPath>
        <g id="surface8" clipPath="url(#clip2)">
          <path
            style={{
              stroke: 'none',
              fillRule: 'evenodd',
              fill: 'rgb(100%,100%,100%)',
              fillOpacity: 1,
            }}
            d="M 27.59375 22.335938 C 27.054688 21.632812 26.511719 20.929688 25.984375 20.394531 C 25.003906 19.40625 24.03125 18.410156 23.058594 17.414062 C 22.574219 16.917969 22.089844 16.421875 21.601562 15.929688 L 21.601562 12.484375 L 21.605469 12.476562 C 21.601562 12.328125 21.628906 12.175781 21.6875 12.035156 C 21.726562 11.945312 21.777344 11.859375 21.839844 11.78125 L 29.273438 4.570312 L 29.273438 23.386719 C 29.273438 23.410156 29.273438 23.5 29.277344 23.617188 C 29.277344 23.882812 29.28125 24.285156 29.273438 24.347656 C 28.71875 23.792969 28.15625 23.0625 27.59375 22.335938 Z M 27.59375 22.335938 "
          />
        </g>
      </defs>
      <g id="surface1">
        <use xlinkHref="#surface5" mask="url(#mask0)" />
        <use xlinkHref="#surface8" mask="url(#mask1)" />
        <path
          style={{
            stroke: 'none',
            fillRule: 'nonzero',
            fill: 'rgb(100%,100%,100%)',
            fillOpacity: 1,
          }}
          d="M -0.03125 8.703125 L -0.03125 19.566406 L 13.503906 33.222656 L 24.269531 33.222656 Z M -0.03125 8.703125 "
        />
        <path
          style={{
            stroke: 'none',
            fillRule: 'nonzero',
            fill: 'rgb(100%,100%,100%)',
            fillOpacity: 1,
          }}
          d="M -0.03125 33.222656 L 9.917969 33.222656 L -0.03125 23.183594 Z M -0.03125 33.222656 "
        />
        <path
          style={{
            stroke: 'none',
            fillRule: 'nonzero',
            fill: 'rgb(100%,100%,100%)',
            fillOpacity: 1,
          }}
          d="M 27.898438 33.222656 L 38.558594 33.222656 L 6.410156 0.105469 C 6.308594 -0.00390625 6.183594 -0.09375 6.046875 -0.152344 C 5.910156 -0.207031 5.761719 -0.234375 5.609375 -0.230469 L -0.0195312 -0.230469 L -0.0195312 4.597656 Z M 27.898438 33.222656 "
        />
      </g>
    </svg>
  );
};
