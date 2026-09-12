import {describe,it,expect,vi,afterEach} from 'vitest';
import {getPexelsPhoto} from '../src/lib/pexels';
afterEach(()=>vi.unstubAllGlobals());
describe('selected licensed source retrieval',()=>{
  it('rejects invalid IDs before networking',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    await expect(getPexelsPhoto('key',-1)).rejects.toThrow('valid');
    await expect(getPexelsPhoto('key',1.5)).rejects.toThrow('valid');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps the selected identity and source host trustworthy',async()=>{
    const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:12,url:'https://www.pexels.com/photo/12/',src:{original:'https://unrelated.test/photo.jpg'}})));
    vi.stubGlobal('fetch',fetch);
    await expect(getPexelsPhoto('key',12)).rejects.toThrow('provenance');
    fetch.mockResolvedValue(new Response(JSON.stringify({id:12,url:'https://www.pexels.com/photo/12/',src:{original:'https://images.pexels.com/photos/12/photo.jpg'}})));
    expect((await getPexelsPhoto('key',12)).id).toBe(12);
  });
});
