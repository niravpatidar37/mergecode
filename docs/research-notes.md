# Research Notes

## Core Hypothesis

AI coding agents are over-optimized for visible test success and under-optimized for merge-worthiness.

## What We Want To Find

MergeCode should produce findings like:

- "Passing patches often delete negative tests."
- "Agents over-edit around the bug site instead of making the minimal fix."
- "Agents introduce duplicated helper logic instead of discovering existing utilities."
- "Dependency changes are used as a shortcut for simple bugs."
- "Test-pass rate overstates mergeability by X% on this fixture set."

## Why This Matters

Maintainers care about:

- correctness under future change
- review time
- codebase consistency
- risk containment
- long-term ownership

Agent benchmarks that only score test success miss those costs.

## Initial Benchmark Shape

Each task should include:

- repo fixture
- task statement
- hidden maintainer notes
- verification commands
- candidate patches
- human label
- expected MergeCode findings

## Writeup Target

Title idea:

> Green Is Not Mergeable: Where AI Coding Patches Fail Maintainer Review

The writeup should include:

- methodology
- examples
- failure taxonomy
- limitations
- what changed in MergeCode after calibration

