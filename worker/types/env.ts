/** Token 由 Secret 注入，不进入前端配置或普通 vars。 */
export interface PostBindings {
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_BRANCH?: string;
  GITHUB_POSTS_PATH?: string;
  GITHUB_TOKEN?: string;
  GITHUB_ALLOW_WRITES?: string;
  APP_ENV?: string;
}
export type AppEnv = { Bindings: Env & PostBindings };
