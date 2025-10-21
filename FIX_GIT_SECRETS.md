# 🚨 FIX: Remove Secrets from Git History

## Problem
You accidentally committed your `.env` file with real OAuth secrets to Git, and GitHub blocked your push.

## CRITICAL: Your exposed secrets MUST be regenerated!
⚠️ **Before anything else, go to Google Cloud Console and regenerate your OAuth credentials!**

## Step-by-Step Fix

### Option 1: Reset and Re-commit (Simplest - if you haven't shared this repo)

```powershell
# We're in: E:\labmate\labmate\backend

# 1. First, backup any important changes
git diff HEAD~2 > my-changes-backup.patch

# 2. Reset to the last good commit (before the .env was added)
git reset --soft origin/main

# 3. Now your changes are staged but the .env commit is gone
# Unstage everything
git reset

# 4. Make sure .env exists in .gitignore (already done!)
# Check: cat .gitignore

# 5. Stage only the files you want (NOT .env)
git add .
git reset HEAD .env    # This ensures .env is NOT staged even if it exists

# 6. Commit again
git commit -m "Backend updates for deployment"

# 7. Push to GitHub
git push --force-with-lease
```

### Option 2: Remove .env from History (More thorough)

```powershell
# Remove .env from all commits
git filter-branch --force --index-filter "git rm --cached --ignore-unmatch .env" --prune-empty --tag-name-filter cat -- --all

# Force push (rewrites history)
git push --force-with-lease
```

### Option 3: Use BFG Repo-Cleaner (Fastest for large repos)

```powershell
# Install BFG: https://rtyley.github.io/bfg-repo-cleaner/
# Download bfg.jar

# Clean .env from history
java -jar bfg.jar --delete-files .env

# Clean up
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push
git push --force-with-lease
```

## After Fixing Git

### 1. Regenerate ALL Exposed Credentials
Go to these services and regenerate:
- ✅ Google OAuth Client ID & Secret (Google Cloud Console)
- ✅ MongoDB connection string (if it contains password)
- ✅ JWT Secret
- ✅ Razorpay keys (if they were in .env)
- ✅ Email app password

### 2. Create New .env Locally
```bash
# Copy from example
cp env.example .env

# Edit with your NEW credentials
notepad .env
```

### 3. Verify .env is Ignored
```powershell
# This should return nothing (meaning .env is ignored)
git status

# If .env shows up, run:
git rm --cached .env
git commit -m "Remove .env from tracking"
```

## Prevention for Future

1. **Always check before committing:**
   ```powershell
   git status
   git diff --staged
   ```

2. **Use pre-commit hooks** (optional but recommended)

3. **Double-check .gitignore** before first commit

## Next Steps: Deployment

Once your git history is clean, proceed with deployment:
1. Choose platform (Vercel + Render recommended)
2. Set environment variables in deployment platform
3. Deploy!

---

**Need help?** Run the commands step by step and let me know if you hit any issues.

