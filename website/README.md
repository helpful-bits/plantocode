# Vibe Manager Website

The official landing page for Vibe Manager - a desktop application that helps developers organize and manage their projects with AI-powered assistance.

## Modern Tech Stack

### Core Technologies

- **Framework**: Next.js 15 (App Router) with React 19 Canary
- **Styling**: Tailwind CSS v4 with Lightning CSS optimization
- **Design System**: OKLCH color space with glass morphism effects
- **3D Graphics**: React Three Fiber with custom WebGL2 shaders
- **Animations**: 60fps scroll-triggered animations with react-scroll-parallax
- **Deployment**: Server-side rendering (SSR) on DigitalOcean App Platform
- **TypeScript**: Strict type checking with advanced ESLint configuration
- **Package Manager**: pnpm with workspace support

### Advanced Features

- **OKLCH Color System**: Perceptually uniform color space for accurate color representation
- **Glass Morphism**: Translucent surfaces with backdrop blur effects
- **WebGL2 Rendering**: Hardware-accelerated graphics with compute shaders
- **Performance Optimization**: 60fps animations with GPU acceleration
- **Accessibility**: WCAG 2.1 AA compliance with comprehensive screen reader support
- **SEO Optimization**: Core Web Vitals optimized with structured data

## Key Features

- **Advanced 3D Rendering**: Custom WebGL2 shaders with React Three Fiber for immersive visual effects
- **OKLCH Color System**: Perceptually uniform color space with CSS custom properties for accurate color representation
- **Glass Morphism Design**: Translucent surfaces with backdrop blur effects and depth hierarchy
- **60fps Animations**: Smooth scroll-triggered animations optimized for consistent frame rates
- **Modern CSS Architecture**: Tailwind CSS v4 with Lightning CSS for optimal performance
- **SEO & Performance**: Core Web Vitals optimized with structured data and meta tags
- **Accessibility First**: WCAG 2.1 AA compliance with comprehensive screen reader support
- **Type Safety**: Full TypeScript coverage with strict ESLint rules

## Development

### Prerequisites

- Node.js 18+ 
- pnpm 8+
- WebGL-compatible browser for 3D features

### Installation

```bash
pnpm install
```

### Development Server

```bash
pnpm dev
```

The site will be available at `http://localhost:3000`

### Build for Production

```bash
pnpm build
```

### Preview Production Build

```bash
pnpm start
```

### Linting

```bash
pnpm lint
```

## Project Structure

```
website/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx         # Root layout with theme system
│   │   ├── page.tsx           # Home page
│   │   └── globals.css        # Global styles with theme variables
│   ├── components/            # React components
│   │   ├── landing/          # Landing page components
│   │   ├── ui/              # Reusable UI components
│   │   ├── vfx/             # 3D and visual effects components
│   │   ├── seo/             # SEO-related components
│   │   └── analytics/       # Analytics components
│   └── lib/                 # Utility functions
├── public/               # Static assets
│   ├── favicon.ico       # Site favicon
│   └── images/          # Image assets
└── .do/                 # DigitalOcean deployment config
    └── app.yaml        # App Platform configuration
```

## Content Management

### Markdown Content

Content can be managed through markdown files in the `content/` directory. Each markdown file should include frontmatter for metadata:

```markdown
---
title: "Page Title"
description: "Page description for SEO"
date: "2024-01-01"
---

Content goes here...
```

### Adding New Pages

1. Create a new directory in `app/`
2. Add a `page.tsx` file
3. Update navigation components as needed

## Design System Integration

The website uses a cutting-edge design system aligned with the desktop application:

- **OKLCH Color System**: Perceptually uniform color space with better color interpolation and accessibility
- **Glass Morphism**: Translucent surfaces with backdrop blur effects for depth and hierarchy
- **Semantic Design Tokens**: Comprehensive theme system with context-aware color tokens
- **Typography**: Variable font support with improved text rendering and OpenType features
- **Spacing**: 8px base unit with fluid scaling using CSS clamp() functions
- **60fps Animations**: Performance-optimized animations with GPU acceleration
- **Components**: Reusable UI components with theme integration and dark mode support
- **3D Integration**: Seamless blending of WebGL2 elements with 2D design system
- **Scroll Animations**: Smooth parallax effects synchronized with page scroll
- **Performance**: Lightning CSS optimization with critical CSS extraction

### Documentation

- **[Design System Documentation](./docs/DESIGN_SYSTEM.md)**: Comprehensive guide to OKLCH colors, glass morphism, and component patterns
- **[Performance Guide](./docs/PERFORMANCE.md)**: Optimization strategies for 60fps animations and Core Web Vitals

## Deployment

### DigitalOcean App Platform

The site is configured for **server-side rendering** deployment on DigitalOcean App Platform:

1. The configuration is in `.do/app.yaml`
2. Deploys automatically on push to `main` branch
3. Build command: `pnpm install && pnpm build`
4. Run command: `pnpm start` (Next.js server)
5. Environment: Node.js runtime
6. Instance: basic-xxs with auto-scaling

**Note**: The `output: 'export'` configuration has been removed to enable server-side rendering, which is required for optimal 3D performance and SEO.

### Manual Deployment

1. Build the application:
   ```bash
   pnpm build
   ```

2. Start the production server:
   ```bash
   pnpm start
   ```

3. The server will run on port 3000 by default

### Environment Variables

Required environment variables for deployment:
- `NODE_ENV=production`
- `NEXT_PUBLIC_GA_MEASUREMENT_ID` (optional, for analytics)

## Environment Variables

Create a `.env.local` file based on `.env.local.example`:

```bash
cp .env.local.example .env.local
```

### Available Variables

- `NEXT_PUBLIC_GA_MEASUREMENT_ID`: Google Analytics measurement ID
- `NODE_ENV`: Environment mode (development/production)

## Dependencies

### Core Dependencies

- `next`: 15.3.5 - Next.js framework
- `react`: ^19.0.0 - React library
- `react-dom`: ^19.0.0 - React DOM renderer
- `schema-dts`: ^1.1.5 - Schema.org TypeScript definitions

### 3D Graphics Dependencies

- `three`: ^0.167.0 - Three.js 3D library with WebGL2 support
- `@react-three/fiber`: ^8.16.8 - React renderer for Three.js with concurrent features
- `@react-three/drei`: ^9.109.2 - Advanced helpers and abstractions for React Three Fiber
- `@types/three`: ^0.167.1 - TypeScript definitions for Three.js

### Animation Dependencies

- `react-scroll-parallax`: ^3.4.2 - Smooth scroll-triggered parallax effects
- `@react-spring/three`: ^9.7.3 - Spring-physics based animations for 3D elements

### Styling Dependencies

- `tailwindcss`: ^4 - Utility-first CSS framework with Lightning CSS
- `@tailwindcss/postcss`: ^4 - PostCSS plugin with enhanced performance
- `lightning-css`: ^1.21.0 - Ultra-fast CSS bundler and minifier

### 3D Features

The website includes cutting-edge 3D elements powered by React Three Fiber:

- **Custom GLSL Shaders**: Hand-crafted vertex and fragment shaders for unique visual effects
- **WebGL2 Rendering**: Hardware-accelerated graphics with advanced GPU features
- **Parallax Integration**: 3D elements synchronized with scroll-triggered animations
- **Performance Optimized**: Efficient rendering with GPU instancing and frustum culling
- **Responsive 3D**: Adaptive quality settings based on device capabilities

### Component Architecture

#### VFX Components (`src/components/vfx/`)

- `ParticleCanvas.tsx`: Advanced particle system with custom GLSL shaders and physics
- `ShaderMaterial.tsx`: Reusable WebGL2 shader components with uniform management
- `Scene.tsx`: Main 3D scene orchestrator with camera controls and lighting
- `GlassMorphism.tsx`: GPU-accelerated glass morphism effects with backdrop blur
- Implements hardware-accelerated effects with WebGL2 compute shaders

#### UI Components (`src/components/ui/`)

- OKLCH color space integration with perceptual color matching
- Glass morphism components with backdrop blur effects
- Semantic design tokens with CSS custom properties
- Accessible component architecture with ARIA compliance
- Responsive design patterns using container queries
- 60fps animation components with GPU acceleration

#### Landing Components (`src/components/landing/`)

- 60fps scroll-triggered animations with react-scroll-parallax
- Glass morphism hero sections with backdrop blur effects
- SEO-optimized content structure with structured data
- Performance-first image optimization with Next.js Image
- Mobile-first responsive design with progressive enhancement
- OKLCH color system integration for consistent branding

## Media Assets

### S3 Integration

Large media assets (videos, high-resolution images) are hosted on S3:

- Bucket: `vibe-manager-assets`
- Region: `us-east-1`
- CDN: CloudFront distribution (if configured)

### Image Optimization

- Use Next.js `Image` component for automatic optimization
- Provide multiple image formats (WebP, AVIF)
- Define responsive image sizes

## SEO Checklist

- [ ] Meta tags in `app/layout.tsx`
- [ ] Open Graph tags for social sharing
- [ ] Twitter Card metadata
- [ ] Canonical URLs
- [ ] XML sitemap generation
- [ ] Robots.txt configuration
- [ ] Structured data (JSON-LD)
- [ ] Alt text for all images
- [ ] Descriptive link text

## Performance Optimizations

### Core Web Vitals

- **LCP** (Largest Contentful Paint): < 2.5s with 3D content preloading
- **FID** (First Input Delay): < 100ms with WebGL optimization
- **CLS** (Cumulative Layout Shift): < 0.1 with stable 3D canvas sizing
- **INP** (Interaction to Next Paint): < 200ms with efficient event handling

### Advanced Optimization Techniques

1. **3D Performance**: GPU instancing, frustum culling, and level-of-detail (LOD) systems
2. **Shader Optimization**: Efficient GLSL code with uniform buffer objects and WebGL2 features
3. **Animation Performance**: 60fps animations with RequestAnimationFrame batching and scroll throttling
4. **Glass Morphism**: Hardware-accelerated backdrop blur with CSS contain and will-change properties
5. **OKLCH Colors**: Perceptually uniform color interpolation with CSS custom properties
6. **CSS Optimization**: Lightning CSS with critical CSS extraction and CSS containment
7. **Image Optimization**: Next.js Image with WebP/AVIF support and responsive sizing
8. **Font Loading**: Variable font subset loading with font-display: swap
9. **Bundle Optimization**: Tree shaking and dynamic imports for 3D dependencies
10. **Caching Strategy**: Stale-while-revalidate for 3D assets and CDN integration

### Performance Monitoring

- Real User Monitoring (RUM) with 3D performance metrics
- WebGL performance profiling with GPU memory usage tracking
- 60fps animation monitoring with frame rate tracking
- Glass morphism performance analysis with backdrop filter metrics
- OKLCH color performance testing with color space conversion benchmarks
- Lighthouse CI with custom 3D performance audits
- Core Web Vitals monitoring with scroll animation performance

## Troubleshooting

### Common Issues

1. **Build Errors**: Check Node version and dependencies
2. **Style Issues**: Clear Next.js cache with `rm -rf .next`
3. **Type Errors**: Run `pnpm tsc --noEmit` to check types

### Debug Mode

Set `NODE_ENV=development` for detailed error messages

## Contributing

1. Create a feature branch
2. Make changes
3. Test locally
4. Submit a pull request

## License

Copyright (c) 2024 Vibe Manager. All rights reserved.