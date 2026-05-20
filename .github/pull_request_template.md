## What this PR does

<!-- One paragraph. What changed and why. -->

## Type of change

- [ ] Bug fix
- [ ] Skill content update (loop-plan / loop-debug)
- [ ] New agent
- [ ] Installer / CLI change
- [ ] CI / tooling
- [ ] Documentation

## Checklist

- [ ] `npm run build && npm test` passes
- [ ] Python tests pass: `python3 test/check-unicode.test.py && python3 test/check-skill-safety.test.py && python3 test/generate-checksums.test.py`
- [ ] Checksums regenerated if skill/agent/bin/command files changed: `python3 ci/generate-checksums.py`
- [ ] No personal paths in shipped files: `grep -rn "/Users/" skills/ agents/ bin/ commands/`
- [ ] No hidden Unicode: `python3 ci/check-unicode.py skills/ agents/`

## Skill content changes

<!-- If you changed a skill or agent file, describe what behavior changed and why. -->

## Notes for reviewers

<!-- Anything that needs special attention or context. -->
