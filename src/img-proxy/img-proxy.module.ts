import { Module } from "@nestjs/common";
import { ImgProxyController } from "./img-proxy.controller";

@Module({ controllers: [ImgProxyController] })
export class ImgProxyModule {}
