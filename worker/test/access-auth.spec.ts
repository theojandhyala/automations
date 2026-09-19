import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { accessRequestHasSafeOrigin, accessTokenFromRequest, verifyAccessToken } from '../src/lib/access-auth';
const config={OWNER_EMAIL:'owner@example.com',PUBLIC_BASE_URL:'https://jarvis.example.com',ACCESS_TEAM_DOMAIN:'https://jarvis.cloudflareaccess.com',ACCESS_AUD:'jarvis-owner-login'};
let privateKey:CryptoKey, keys:ReturnType<typeof createLocalJWKSet>;
beforeAll(async()=>{const pair=await generateKeyPair('RS256',{extractable:true});privateKey=pair.privateKey;const jwk=await exportJWK(pair.publicKey);keys=createLocalJWKSet({keys:[{...jwk,kid:'test',alg:'RS256'}]});});
const signed=(claims:Record<string,unknown>={})=>new SignJWT({email:config.OWNER_EMAIL,...claims}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer(String(claims.iss??config.ACCESS_TEAM_DOMAIN)).setAudience(String(claims.aud??config.ACCESS_AUD)).setSubject('owner').setIssuedAt().setExpirationTime(claims.exp as number??'5m').sign(privateKey);
describe('Cloudflare owner identity',()=>{
 it('accepts only a verified owner token for this exact app and issuer',async()=>{
  expect(await verifyAccessToken(await signed(),config,keys)).toBe(config.OWNER_EMAIL);
  for(const claims of [{email:'someone@example.com'},{aud:'another-app'},{iss:'https://evil.cloudflareaccess.com'},{exp:1}])expect(await verifyAccessToken(await signed(claims),config,keys)).toBeNull();
  expect(await verifyAccessToken('not.a.token',config,keys)).toBeNull();
  const token=await signed();expect(await verifyAccessToken(token.slice(0,-8)+'tampered',config,keys)).toBeNull();
  expect(await verifyAccessToken(token,{...config,ACCESS_AUD:undefined},keys)).toBeNull();
 });
 it('reads a single authorization cookie without trusting an email header',()=>{
  expect(accessTokenFromRequest(new Request(config.PUBLIC_BASE_URL,{headers:{'Cf-Access-Authenticated-User-Email':config.OWNER_EMAIL}}))).toBeNull();
  expect(accessTokenFromRequest(new Request(config.PUBLIC_BASE_URL,{headers:{Cookie:'other=x; CF_Authorization=token'}}))).toBe('token');
  expect(accessTokenFromRequest(new Request(config.PUBLIC_BASE_URL,{headers:{Cookie:'CF_Authorization=a; CF_Authorization=b'}}))).toBeNull();
 });
 it('requires the configured same origin for cookie-authenticated mutations',()=>{
  for(const origin of [undefined,'https://evil.example.com','null'])expect(accessRequestHasSafeOrigin(new Request(config.PUBLIC_BASE_URL+'/api/write',{method:'POST',headers:origin?{Origin:origin}:undefined}),config)).toBe(false);
  expect(accessRequestHasSafeOrigin(new Request(config.PUBLIC_BASE_URL+'/api/write',{method:'POST',headers:{Origin:config.PUBLIC_BASE_URL}}),config)).toBe(true);
 });
});
