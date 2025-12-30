# Pre-Deployment Checklist

Before deploying to Coolify, run these checks locally to catch TypeScript and linting errors:

## ⚠️ IMPORTANT: Why Local Builds Can Pass But Deployments Fail

**The Problem:** Your local environment may have generated files (like Prisma Client) from previous runs. These files won't exist in a fresh deployment environment, causing builds to fail even though they passed locally.

**The Solution:** Always run `npm run build:clean` before deploying to simulate a fresh environment.

## Recommended: Clean Build Check

**Always run this before deploying:**
```bash
cd convex-dashboard
npm run build:clean
```

Or use the pre-deploy script:
```bash
npm run pre-deploy
```

This will:
1. 🧹 Clean all generated files (Prisma Client, Next.js build cache)
2. ✅ Generate Prisma Client from scratch
3. ✅ Run TypeScript type checking (`type-check`)
4. ✅ Run ESLint (`lint`)
5. ✅ Build the Next.js application (`next build`)

If any step fails, fix the errors before deploying.

## Quick Check (May Miss Issues)

```bash
cd convex-dashboard
npm run build
```

This will:
1. ✅ Generate Prisma Client (if missing)
2. ✅ Run TypeScript type checking (`type-check`)
3. ✅ Run ESLint (`lint`)
4. ✅ Build the Next.js application (`next build`)

**Warning:** This may pass even if deployment fails if Prisma Client already exists locally.

## Individual Checks

### Type Checking Only
```bash
npm run type-check
```
Catches TypeScript errors including:
- Implicit `any` types
- Type mismatches
- Unused variables/parameters
- Missing return types

### Linting Only
```bash
npm run lint
```
Catches code quality issues and style violations.

### Type Check in Watch Mode
```bash
npm run type-check:watch
```
Continuously checks types as you edit files (useful during development).

## Skip Checks (Emergency Only)

If you need to build without checks (not recommended):
```bash
npm run build:skip-checks
```

## Stricter TypeScript Settings

The project now uses stricter TypeScript settings:
- `noImplicitAny: true` - Prevents implicit `any` types
- `strictNullChecks: true` - Requires explicit null/undefined handling
- `noUnusedLocals: true` - Flags unused variables
- `noUnusedParameters: true` - Flags unused function parameters
- `noImplicitReturns: true` - Requires explicit return statements

These settings help catch errors early and improve code quality.

## CI/CD Integration

The `build` script automatically runs checks, so Coolify will catch errors during deployment. However, it's faster to catch them locally first!

## Troubleshooting

If you see TypeScript errors:
1. Read the error message carefully - it usually tells you exactly what's wrong
2. Check the file and line number mentioned
3. Add explicit types if needed
4. Use `// @ts-ignore` or `// @ts-expect-error` sparingly and only when necessary

If you see linting errors:
1. Run `npm run lint -- --fix` to auto-fix some issues
2. Check the ESLint rules in `eslint.config.mjs`
3. Fix remaining issues manually

