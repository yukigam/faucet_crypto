'use client';

export default function AdBanner() {
  return (
    <div className="w-full overflow-hidden flex justify-center">
      <div id="frame" style={{ width: '100%', maxWidth: '100%', margin: 'auto', position: 'relative', zIndex: 99998 }}>
        <iframe
          data-aa="2448525"
          src="//acceptable.a-ads.com/2448525/?size=Adaptive"
          style={{ border: 0, padding: 0, width: '100%', height: '90px', overflow: 'hidden', display: 'block', margin: 'auto' }}
        />
      </div>
    </div>
  );
}
