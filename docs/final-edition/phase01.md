# Final Edition — Phase 0–1 engineering evidence

This is an engineering baseline, not Final Edition publication or host acceptance.

## Independently audited math/physics

- G01: `A(h)=h*sqrt(2rh-h²)`, `0<h<2r`. Its derivative is `h(3r-2h)/sqrt(2rh-h²)`, hence maximum at `h=3r/2`. Independently, the equilateral triangle has circumradius r, side `sqrt(3)r`, area `3sqrt(3)r²/4`. For r=2 cm: h=3 cm, base=2sqrt(3) cm, area=3sqrt(3) cm²≈5.196152422706632. At h=r: h=2 cm, base=4 cm, area=4 cm². Analytic endpoints are degenerate; actual slider is [0.05,1.95].
- G02 cone: R/H=1/2, surface radius=h/2, V=pi*h³/12. At h=2 m the area is pi m²; independent conservation gives dh/dt=Q/area=2/pi m/s≈0.6366197723675814. Volume=2pi/3 m³, radius rate=1/pi m/s. Assume constant inflow, no outflow, stationary cone, 0<h<H; h=0 is singular, stop at full capacity.
- G02 integral: dimensionless real x, u=x², du=2x dx. Primitive=sin(x²)+C. Chain-rule derivative=2x cos(x²), including x=0. No division by x or global inverse assumption. Finite difference is supplementary, not a symbolic proof or renderer solver.
- G03 motion: explicitly x0=0 m, v0=20 m/s, a=-10 m/s², 0<=t<=2 s. At t=0/1/2: positions 0/15/20 m; velocities 20/10/0 m/s. Independent velocity-area oracle gives a 15 m trapezoid and a 20 m triangle.
- G03 incline: stationary smooth plane, only gravity/contact, global +x right/+y up; m=2 kg, g=10 m/s², theta=30°. Independent projections give N=10sqrt(3) N, tangential acceleration=-5 m/s². Normal vector=(-5sqrt(3),15) N; net=(-5sqrt(3),-5) N, magnitude 10 N; acceleration=(-5sqrt(3)/2,-5/2) m/s², magnitude 5. At -30°, mirror x; at 0°, N=20 N and net=0; at +/-90°, N=0, gravity only. No default g or friction/extra-force model.

Expected constants are hand-audited and never generated from production functions. Component checks use real DOM controls and numeric SVG outputs. Calculus has no production solver: its tests check an independent oracle plus exact authored formulas and complete compiled fallback, not arbitrary calculus correctness.

See [B0](b0.md) for original RC4 evidence and [B1](b1.md) for repaired engineering results, commands, package checks and limitations. The ignored final-results record binds verification to the submitted SHA. Browser layout, Gallery, actual model routing, private host and deployment remain outside this scope.
