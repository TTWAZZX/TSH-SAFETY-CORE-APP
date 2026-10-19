/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './index.html',
        './public/js/**/*.{js,mjs}',
        '!./public/js/fullcalendar.js',
        '!./public/vendor/**',
    ],
    theme: {
        extend: {},
    },
    plugins: [],
};
