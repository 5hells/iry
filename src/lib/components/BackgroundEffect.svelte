<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		effect: 'matrix' | 'sparkles' | 'rain';
		config?: any;
	}

	let { effect, config = {} }: Props = $props();
	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null;
	let animationId: number;

	onMount(() => {
		ctx = canvas.getContext('2d');
		resizeCanvas();
		window.addEventListener('resize', resizeCanvas);

		if (effect === 'matrix') {
			startMatrix();
		} else if (effect === 'sparkles') {
			startSparkles();
		} else if (effect === 'rain') {
			startRain();
		}
	});

	onDestroy(() => {
		window.removeEventListener('resize', resizeCanvas);
		if (animationId) {
			cancelAnimationFrame(animationId);
		}
	});

	function resizeCanvas() {
		if (!canvas) return;
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
	}

	function startMatrix() {
		if (!ctx || !canvas) return;

		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()';
		const fontSize = 14;
		const columns = canvas.width / fontSize;
		const drops: number[] = [];

		for (let i = 0; i < columns; i++) {
			drops[i] = Math.random() * canvas.height;
		}

		function draw() {
			if (!ctx || !canvas) return;

			ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
			ctx.fillRect(0, 0, canvas.width, canvas.height);

			ctx.fillStyle = '#0F0';
			ctx.font = fontSize + 'px monospace';

			for (let i = 0; i < drops.length; i++) {
				const text = chars[Math.floor(Math.random() * chars.length)];
				ctx.fillText(text, i * fontSize, drops[i] * fontSize);

				if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
					drops[i] = 0;
				}
				drops[i]++;
			}

			animationId = requestAnimationFrame(draw);
		}

		draw();
	}

	interface Sparkle {
		x: number;
		y: number;
		vx: number;
		vy: number;
		life: number;
		maxLife: number;
		size: number;
	}

	function startSparkles() {
		if (!ctx || !canvas) return;

		const sparkles: Sparkle[] = [];
		const sparkleCount = 50;

		for (let i = 0; i < sparkleCount; i++) {
			sparkles.push(createSparkle());
		}

		function createSparkle(): Sparkle {
			return {
				x: Math.random() * canvas.width,
				y: Math.random() * canvas.height,
				vx: (Math.random() - 0.5) * 0.5,
				vy: (Math.random() - 0.5) * 0.5,
				life: Math.random() * 100,
				maxLife: 100,
				size: Math.random() * 3 + 1
			};
		}

		function draw() {
			if (!ctx || !canvas) return;

			ctx.clearRect(0, 0, canvas.width, canvas.height);

			for (let i = 0; i < sparkles.length; i++) {
				const s = sparkles[i];

				s.x += s.vx;
				s.y += s.vy;
				s.life--;

				if (s.life <= 0) {
					sparkles[i] = createSparkle();
					continue;
				}

				const opacity = s.life / s.maxLife;
				ctx.fillStyle = `rgba(255, 215, 0, ${opacity})`;
				ctx.beginPath();
				ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
				ctx.fill();

				ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.5})`;
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(s.x - s.size * 2, s.y);
				ctx.lineTo(s.x + s.size * 2, s.y);
				ctx.moveTo(s.x, s.y - s.size * 2);
				ctx.lineTo(s.x, s.y + s.size * 2);
				ctx.stroke();
			}

			animationId = requestAnimationFrame(draw);
		}

		draw();
	}

	interface RainDrop {
		x: number;
		y: number;
		speed: number;
		length: number;
	}

	function startRain() {
		if (!ctx || !canvas) return;

		const raindrops: RainDrop[] = [];
		const raindropCount = 200;

		for (let i = 0; i < raindropCount; i++) {
			raindrops.push(createRaindrop());
		}

		function createRaindrop(): RainDrop {
			return {
				x: Math.random() * canvas.width,
				y: Math.random() * canvas.height - canvas.height,
				speed: Math.random() * 5 + 5,
				length: Math.random() * 20 + 10
			};
		}

		function draw() {
			if (!ctx || !canvas) return;

			ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
			ctx.fillRect(0, 0, canvas.width, canvas.height);

			ctx.strokeStyle = 'rgba(174, 194, 224, 0.5)';
			ctx.lineWidth = 2;

			for (let i = 0; i < raindrops.length; i++) {
				const r = raindrops[i];

				ctx.beginPath();
				ctx.moveTo(r.x, r.y);
				ctx.lineTo(r.x, r.y + r.length);
				ctx.stroke();

				r.y += r.speed;

				if (r.y > canvas.height) {
					raindrops[i] = createRaindrop();
				}
			}

			animationId = requestAnimationFrame(draw);
		}

		draw();
	}
</script>

<canvas
	bind:this={canvas}
	class="pointer-events-none fixed inset-0"
	style="z-index: 0; opacity: 0.6;"
></canvas>
