const tiles = [
  'forest',
  'field',
  'hill',
  'mountain',
  'pasture',
  'desert',
  'forest',
  'field',
  'hill',
];

function BoardPreview() {
  return (
    <div className="board-preview" aria-label="Small Catan board preview">
      {tiles.map((tile, index) => (
        <span key={`${tile}-${index}`} className={`hex-tile ${tile}`} />
      ))}
    </div>
  );
}

export default BoardPreview;
