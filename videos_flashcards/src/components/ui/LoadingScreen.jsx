import React from 'react';

const LoadingScreen = () => (
  <div className="fixed inset-0 bg-white z-[100] flex flex-col items-center justify-center">
    <div className="w-16 h-16 border-4 border-gray-200 border-t-[#008080] rounded-full animate-spin mb-4"></div>
    <h2 className="text-2xl font-serif font-bold text-gray-800 animate-pulse">Cabinet du Seujet</h2>
    <p className="text-gray-500 mt-2">Chargement de votre espace...</p>
  </div>
);

export default LoadingScreen;