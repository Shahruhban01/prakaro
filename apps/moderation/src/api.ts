import axios from 'axios';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
export const api=axios.create({baseURL:'/api/v1/moderation',headers:{'X-Prakaro-Console':'1'},timeout:12000});
export type Actor={userId:string;role:string;admin:boolean;queues:string[]};
export type Rule={op:'AND'|'OR';children:Rule[]}|{field:string;value:string};
export type Question={key:string;label:string;type:string;required:boolean;options:string[];when?:{key:string;equals:string}};
export type Config={rule:Rule;form:Question[];columns:string[];slaHours:number;qaPercent:number};
export type Queue={id:string;name:string;description:string;code:string;kind:string;status:string;capacity:number;priority:number;version:number;config:Config};
export type CaseRow={id:string;code:string;facilityId:string;category:string;status:string;trigger:string;priority:number;owner:string|null;createdAt:string;revision:number};
export type Detail=CaseRow&{admission:{demand:number;facility:{googlePlaceId:string;evidence:{id:string;source:string;finding:string;reference:string;expiresAt:string}[];runs:{status:string;outcome:string|null}[]}};tasks:{id:string;queueId:string;queueVersion:number;form:Config}[];reviews:{id:string;action:string;reason:string;reviewerId:string;answers:Record<string,unknown>}[]};
export function useData<T>(url:string){return useQuery({queryKey:[url],queryFn:async()=>(await api.get<T>(url)).data,retry:false})}
export function useAction(){const client=useQueryClient();return useMutation({mutationFn:async(input:{url:string;data?:unknown;method?:'put'|'post'})=>(await api.request({url:input.url,method:input.method??'post',data:input.data??{}})).data,onSuccess:()=>client.invalidateQueries()})}
export function errorText(error:unknown){return axios.isAxiosError(error)?String(error.response?.data?.error?.message??error.message):'Request failed.'}

