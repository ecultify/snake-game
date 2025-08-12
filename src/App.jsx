import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls } from "@react-three/drei";

// === Utility helpers ===
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const keyToDir = (key, cur) => {
  const map = {
    ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, 1], s: [0, -1], a: [-1, 0], d: [1, 0],
  };
  const next = map[key];
  if (!next) return cur;
  if (cur && next[0] === -cur[0] && next[1] === -cur[1]) return cur;
  return next;
};

function useKeyboardDirection(initial = [1, 0]) {
  const [dir, setDir] = useState(initial);
  useEffect(() => {
    const onKey = (e) => setDir((cur) => keyToDir(e.key, cur));
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return [dir, setDir];
}

// === Game logic hook without useFrame ===
function useSnakeGame({ size = 20, stepTime = 0.2, running, onGameOver }) {
  const [snake, setSnake] = useState(() => [[0, 0], [-1, 0], [-2, 0]]);
  const [dir, setDir] = useKeyboardDirection([1, 0]);
  const [food, setFood] = useState([3, 0]);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [obstacles, setObstacles] = useState([]);
  const [powerUps, setPowerUps] = useState([]);
  const [scoreboard, setScoreboard] = useState([]);

  const highScore = useRef(parseInt(localStorage.getItem("snakeHighScore") || "0"));
  const occupied = useMemo(() => new Set(snake.map((p) => p.join(","))), [snake]);

  const wrap = (n) => {
    if (n > size) return -size;
    if (n < -size) return size;
    return n;
  };

  const spawnFood = () => {
    let p;
    do { p = [randInt(-size, size), randInt(-size, size)]; } while (occupied.has(p.join(",")));
    setFood(p);
  };

  const spawnObstacle = () => {
    let p;
    do { p = [randInt(-size, size), randInt(-size, size)]; } while (occupied.has(p.join(",")) || (p[0] === food[0] && p[1] === food[1]));
    setObstacles((obs) => [...obs, p]);
  };

  const spawnPowerUp = () => {
    let p;
    do { p = [randInt(-size, size), randInt(-size, size)]; } while (occupied.has(p.join(",")));
    setPowerUps((pu) => [...pu, { position: p, type: Math.random() < 0.5 ? 'speed' : 'points', timer: 5000 }]);
  };

  const reset = () => {
    setSnake([[0, 0], [-1, 0], [-2, 0]]);
    setDir([1, 0]);
    setScore(0);
    setLevel(1);
    setFood([3, 0]);
    setObstacles([]);
    setPowerUps([]);
  };

  const updateGame = () => {
    if (!running) return;
    
    setSnake((prev) => {
      const head = prev[0];
      const next = [wrap(head[0] + dir[0]), wrap(head[1] + dir[1])];
      const bodySet = new Set(prev.map((p) => p.join(",")));
      if (bodySet.has(next.join(",")) || obstacles.some(o => o[0] === next[0] && o[1] === next[1])) {
        setScoreboard((sb) => [...sb, { name: typeof window !== 'undefined' ? (window.prompt?.("Enter your initials:") || 'AAA') : 'AAA', score }]);
        onGameOver?.(score);
        return prev;
      }

      let newSnake = [next, ...prev];
      if (next[0] === food[0] && next[1] === food[1]) {
        setScore((s) => {
          const newScore = s + 10;
          if (newScore > highScore.current) {
            highScore.current = newScore;
            try { localStorage.setItem("snakeHighScore", String(newScore)); } catch {}
          }
          if (newScore % 50 === 0) {
            setLevel((lvl) => lvl + 1);
            spawnObstacle();
          }
          return newScore;
        });
        spawnFood();
        if (Math.random() < 0.2) spawnPowerUp();
      } else {
        newSnake.pop();
      }

      powerUps.forEach((pu) => {
        if (pu.position[0] === next[0] && pu.position[1] === next[1]) {
          if (pu.type === 'speed') stepTime *= 0.85;
          if (pu.type === 'points') setScore((s) => s + 50);
          setPowerUps((all) => all.filter(p => p !== pu));
        }
      });
      return newSnake;
    });
  };

  return { 
    snake, 
    food, 
    score, 
    level, 
    reset, 
    obstacles, 
    powerUps, 
    scoreboard, 
    highScore: highScore.current,
    updateGame,
    stepTime
  };
}

// === Game Loop Component (inside Canvas) ===
function GameLoop({ gameState, running }) {
  const tRef = useRef(0);
  
  useFrame((_, delta) => {
    if (!running) return;
    tRef.current += delta;
    if (tRef.current < gameState.stepTime) return;
    tRef.current = 0;
    gameState.updateGame();
  });
  
  return null;
}

// === Visual Components ===
const CellSize = 1;
function Snake({ points }) {
  return (
    <group>
      {points.map(([x, y], i) => (
        <mesh key={`${x},${y},${i}`} position={[x * CellSize, 0.5, y * CellSize]}>
          <boxGeometry args={[0.9, 0.9, 0.9]} />
          <meshStandardMaterial color={i === 0 ? "lime" : "green"} />
        </mesh>
      ))}
    </group>
  );
}
function Food({ position }) {
  return (
    <mesh position={[position[0] * CellSize, 0.5, position[1] * CellSize]}>
      <icosahedronGeometry args={[0.45, 0]} />
      <meshStandardMaterial emissiveIntensity={0.6} color="red" />
    </mesh>
  );
}
function PowerUp({ position, type }) {
  return (
    <mesh position={[position[0] * CellSize, 0.5, position[1] * CellSize]}>
      <sphereGeometry args={[0.4, 16, 16]} />
      <meshStandardMaterial color={type === 'speed' ? 'blue' : 'gold'} />
    </mesh>
  );
}
function Obstacle({ position }) {
  return (
    <mesh position={[position[0] * CellSize, 0.5, position[1] * CellSize]}>
      <boxGeometry args={[0.9, 0.9, 0.9]} />
      <meshStandardMaterial color="gray" />
    </mesh>
  );
}
function Ground({ size }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[(size * 2 + 2), (size * 2 + 2)]} />
        <meshStandardMaterial color="#f0f0f0" />
      </mesh>
      <gridHelper args={[size * 2 + 2, (size * 2 + 2)]} position={[0, 0.01, 0]} />
    </group>
  );
}

// === Main Scene ===
function Scene() {
  const [running, setRunning] = useState(true);
  const [size, setSize] = useState(20);
  const [speed, setSpeed] = useState(0.18);
  const [gameOver, setGameOver] = useState(false);
  const gameState = useSnakeGame({
    size,
    stepTime: speed,
    running: running && !gameOver,
    onGameOver: () => setGameOver(true),
  });

  return (
    <div className="w-full h-screen relative">
      <Canvas shadows camera={{ position: [size * 1.2, size * 1.2, size * 1.2], fov: 50 }}>
        <GameLoop gameState={gameState} running={running && !gameOver} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 20, 10]} intensity={0.8} />
        <Ground size={size} />
        <Snake points={gameState.snake} />
        <Food position={gameState.food} />
        {gameState.obstacles.map((o, i) => <Obstacle key={i} position={o} />)}
        {gameState.powerUps.map((pu, i) => <PowerUp key={i} position={pu.position} type={pu.type} />)}
        <OrbitControls />
      </Canvas>
      <div className="absolute top-3 left-3 hud">
        <div>Score: {gameState.score} | Level: {gameState.level} | High: {gameState.highScore}</div>
        <button className="hud-btn" onClick={() => setRunning(r => !r)}>{running ? "Pause" : "Resume"}</button>
        <button className="hud-btn" onClick={() => { gameState.reset(); setGameOver(false); setRunning(true); }}>Reset</button>
      </div>
      {gameState.scoreboard.length > 0 && (
        <div className="absolute bottom-20 left-3 hud">
          <div className="font-bold">Scoreboard:</div>
          {gameState.scoreboard.map((s, i) => (
            <div key={i}>{s.name || '???'} — {s.score}</div>
          ))}
        </div>
      )}
      {gameOver && <div className="absolute inset-0 flex items-center justify-center">Game Over</div>}
    </div>
  );
}

export default function App() {
  return (
    <div>
      <h1>3D Snake Game — Levels, Scoreboard & Power-ups</h1>
      <Scene />
    </div>
  );
}
