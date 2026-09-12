import { describe, expect, it } from 'vitest';
import example from '../skills/frame-previs-scene-builder/references/example-scene.json';
import { calculateResolution, parseProject } from '../src/model';

describe('scene builder skill example', () => {
  it('imports through the application parser with matching output dimensions', () => {
    const project = parseProject(example);
    expect(project.resolution).toEqual(calculateResolution(project.output.aspectRatio, project.output.megapixels));
    expect(project.cameras).toHaveLength(2);
    expect(project.groups[0].objectIds).toEqual(['actor-a', 'actor-b']);
  });
});
